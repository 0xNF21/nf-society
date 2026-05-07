"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { X, Loader2, Check, AlertTriangle, Copy } from "lucide-react";
import { useMiniApp } from "@/components/miniapp-provider";
import { useAuthSession } from "@/components/auth-provider";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

/**
 * Auth modal — entry point for the login flow.
 *
 * Mini App :
 *   - On open, calls /api/auth/challenge (method=miniapp_sign_message)
 *   - Asks the host to sign via passkey
 *   - Sends signature to /api/auth/verify-signature
 *   - On success, refreshes session
 *
 * Standalone :
 *   - On open, calls /api/auth/challenge (method=payment_1crc)
 *   - Shows QR code + payment link (1 CRC, refunded)
 *   - Polls /api/auth/verify-payment every 3 sec
 *   - On confirmed, refreshes session
 *
 * Both flows result in a server cookie being set; the AuthProvider then
 * picks up the new state via refresh().
 */

type Step =
  | { kind: "idle" }
  | { kind: "loading_challenge" }
  | { kind: "miniapp_signing" }
  | { kind: "miniapp_verifying" }
  | { kind: "standalone_waiting"; challengeId: number; nonce: string; verifyToken: string; paymentLink: string; qrCode: string }
  | { kind: "standalone_polling"; challengeId: number; nonce: string; verifyToken: string; paymentLink: string; qrCode: string }
  | { kind: "success" }
  | { kind: "error"; message: string };

/**
 * sessionStorage key for the pending standalone challenge. Persisted across
 * page reloads so the user doesn't lose their verifyToken (and therefore
 * their ability to claim the session + trigger the 1 CRC refund) if they
 * navigate away while their wallet processes the tx.
 *
 * Tab-scoped (sessionStorage), so the secret never leaks to other tabs/
 * users on shared devices. Cleared on success / explicit close / expiry.
 */
const PENDING_AUTH_KEY = "nfs_auth_pending_challenge";

type PendingChallenge = {
  challengeId: number;
  nonce: string;
  verifyToken: string;
  paymentLink: string;
  qrCode: string;
  expiresAt: number;
};

function loadPendingChallenge(): PendingChallenge | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingChallenge;
    if (!parsed || typeof parsed.challengeId !== "number" || !parsed.verifyToken) return null;
    if (Date.now() >= parsed.expiresAt) {
      sessionStorage.removeItem(PENDING_AUTH_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function savePendingChallenge(p: PendingChallenge): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_AUTH_KEY, JSON.stringify(p));
  } catch {
    // sessionStorage might be disabled (private mode etc.) — degrade
    // silently. The user just loses persistence across reloads.
  }
}

function clearPendingChallenge(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_AUTH_KEY);
  } catch {}
}

interface AuthConnectModalProps {
  open: boolean;
  onClose: () => void;
}

export function AuthConnectModal({ open, onClose }: AuthConnectModalProps) {
  const { isMiniApp, walletAddress, signMessage } = useMiniApp();
  const { refresh } = useAuthSession();
  const { locale } = useLocale();
  const t = translations.auth;
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const cancelledRef = useRef(false);

  // Auto-start the appropriate flow when the modal opens.
  useEffect(() => {
    if (!open) {
      setStep({ kind: "idle" });
      cancelledRef.current = false;
      return;
    }

    cancelledRef.current = false;

    if (isMiniApp) {
      void runMiniAppFlow();
    } else {
      void runStandaloneFlow();
    }

    return () => {
      cancelledRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function runMiniAppFlow() {
    if (!walletAddress) {
      setStep({ kind: "error", message: t.errMiniAppNoWallet[locale] });
      return;
    }

    setStep({ kind: "loading_challenge" });

    try {
      // 1. Get a sign_message challenge.
      const challengeRes = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method: "miniapp_sign_message",
          origin: "miniapp",
          expectedAddress: walletAddress,
        }),
      });
      const challengeData = await challengeRes.json();
      if (!challengeRes.ok || !challengeData?.challengeId) {
        throw new Error(challengeData?.error ?? "challenge_failed");
      }

      if (cancelledRef.current) return;
      setStep({ kind: "miniapp_signing" });

      // 2. Ask Circles host to sign.
      const sig = await signMessage(challengeData.message);
      if (cancelledRef.current) return;
      setStep({ kind: "miniapp_verifying" });

      // 3. Verify on the server.
      const verifyRes = await fetch("/api/auth/verify-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          challengeId: challengeData.challengeId,
          signature: sig.signature,
          address: walletAddress,
        }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData?.authenticated) {
        throw new Error(verifyData?.error ?? "verify_failed");
      }

      if (cancelledRef.current) return;
      await refresh();
      setStep({ kind: "success" });

      setTimeout(() => {
        if (!cancelledRef.current) onClose();
      }, 1200);
    } catch (err: any) {
      if (cancelledRef.current) return;
      const message = typeof err === "string" ? err : err?.message ?? t.errGeneric[locale];
      setStep({ kind: "error", message });
    }
  }

  async function runStandaloneFlow() {
    // Resume from a pending challenge if the user reloaded mid-payment.
    // This prevents losing the verifyToken (and thus the 1 CRC) when the
    // wallet flow takes the user away from the tab.
    const pending = loadPendingChallenge();
    if (pending) {
      const resumedState: Step = {
        kind: "standalone_waiting",
        challengeId: pending.challengeId,
        nonce: pending.nonce,
        verifyToken: pending.verifyToken,
        paymentLink: pending.paymentLink,
        qrCode: pending.qrCode,
      };
      setStep(resumedState);
      pollPayment(resumedState);
      return;
    }

    setStep({ kind: "loading_challenge" });

    try {
      const challengeRes = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "payment_1crc", origin: "standalone" }),
      });
      const challengeData = await challengeRes.json();
      if (!challengeRes.ok || !challengeData?.challengeId) {
        throw new Error(challengeData?.error ?? "challenge_failed");
      }

      if (cancelledRef.current) return;

      if (!challengeData.verifyToken) {
        throw new Error("missing_verify_token");
      }

      // Persist the pending challenge so a reload doesn't lose the secret.
      const expiresAtMs = challengeData.expiresAt
        ? new Date(challengeData.expiresAt).getTime()
        : Date.now() + 30 * 60 * 1000;
      savePendingChallenge({
        challengeId: challengeData.challengeId,
        nonce: challengeData.nonce,
        verifyToken: challengeData.verifyToken,
        paymentLink: challengeData.paymentLink,
        qrCode: challengeData.qrCode,
        expiresAt: expiresAtMs,
      });

      const initialState: Step = {
        kind: "standalone_waiting",
        challengeId: challengeData.challengeId,
        nonce: challengeData.nonce,
        verifyToken: challengeData.verifyToken,
        paymentLink: challengeData.paymentLink,
        qrCode: challengeData.qrCode,
      };
      setStep(initialState);

      // Poll verify-payment every 3 sec until confirmed/expired/error.
      pollPayment(initialState);
    } catch (err: any) {
      if (cancelledRef.current) return;
      const message = typeof err === "string" ? err : err?.message ?? t.errGeneric[locale];
      setStep({ kind: "error", message });
    }
  }

  async function pollPayment(prev: Step) {
    if (prev.kind !== "standalone_waiting" && prev.kind !== "standalone_polling") return;

    const tick = async () => {
      if (cancelledRef.current) return;

      try {
        const res = await fetch("/api/auth/verify-payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            challengeId: prev.challengeId,
            verifyToken: prev.verifyToken,
            origin: "standalone",
          }),
        });
        const data = await res.json();
        if (cancelledRef.current) return;

        if (data?.status === "confirmed" || data?.authenticated) {
          clearPendingChallenge();
          await refresh();
          setStep({ kind: "success" });
          setTimeout(() => {
            if (!cancelledRef.current) onClose();
          }, 1200);
          return;
        }

        if (data?.status === "expired") {
          clearPendingChallenge();
          setStep({ kind: "error", message: t.errExpired[locale] });
          return;
        }

        // status "waiting" or other transient — keep polling.
        setTimeout(tick, 3000);
      } catch {
        if (cancelledRef.current) return;
        setTimeout(tick, 5000); // back off on error
      }
    };

    setTimeout(tick, 3000);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-ink shadow-xl border border-ink/10 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink dark:text-white">
            {t.title[locale]}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-ink/5 transition-colors"
            aria-label={t.close[locale]}
          >
            <X className="h-4 w-4 text-ink/60 dark:text-white/60" />
          </button>
        </div>

        <div className="min-h-[280px] flex flex-col items-center justify-center text-center">
          {step.kind === "loading_challenge" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-marine" />
              <p className="text-sm text-ink/60 dark:text-white/60">
                {t.preparing[locale]}
              </p>
            </div>
          )}

          {step.kind === "miniapp_signing" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-marine" />
              <p className="text-sm text-ink/80 dark:text-white/80 font-semibold">
                {t.miniappSigning[locale]}
              </p>
              <p className="text-xs text-ink/50 dark:text-white/50">
                {t.miniappSigningHint[locale]}
              </p>
            </div>
          )}

          {step.kind === "miniapp_verifying" && (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-marine" />
              <p className="text-sm text-ink/80 dark:text-white/80">
                {t.verifying[locale]}
              </p>
            </div>
          )}

          {(step.kind === "standalone_waiting" || step.kind === "standalone_polling") && (
            <div className="flex flex-col items-center gap-4 w-full">
              <p className="text-sm text-ink/80 dark:text-white/80">
                {t.standaloneInstruction[locale]}
              </p>
              {step.qrCode && (
                <Image
                  src={step.qrCode}
                  alt={t.qrAlt[locale]}
                  width={220}
                  height={220}
                  className="rounded-lg border border-ink/10"
                />
              )}
              <div className="flex gap-2 w-full">
                <a
                  href={step.paymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 text-center py-2 rounded-lg bg-marine text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                >
                  {t.openWallet[locale]}
                </a>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(step.paymentLink);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {}
                  }}
                  className="px-3 py-2 rounded-lg border border-marine/30 text-marine text-sm font-semibold hover:bg-marine/5 transition-colors flex items-center gap-1.5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  {copied ? t.copied[locale] : t.copyLink[locale]}
                </button>
              </div>
              <p className="text-xs text-ink/50 dark:text-white/50">
                {t.refundNote[locale]}
              </p>
            </div>
          )}

          {step.kind === "success" && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm text-ink dark:text-white font-semibold">
                {t.success[locale]}
              </p>
            </div>
          )}

          {step.kind === "error" && (
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                <AlertTriangle className="h-6 w-6 text-red-600" />
              </div>
              <p className="text-sm text-ink dark:text-white font-semibold">
                {t.errTitle[locale]}
              </p>
              <p className="text-xs text-ink/60 dark:text-white/60">
                {step.message}
              </p>
              <button
                onClick={() => {
                  if (isMiniApp) void runMiniAppFlow();
                  else void runStandaloneFlow();
                }}
                className="mt-2 px-4 py-2 rounded-lg bg-marine text-white text-sm font-semibold hover:opacity-90 transition-opacity"
              >
                {t.retry[locale]}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
