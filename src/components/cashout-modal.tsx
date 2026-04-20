"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Copy, Check, Loader2, QrCode, RefreshCw, CheckCircle, ArrowDownCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { useMiniApp } from "@/components/miniapp-provider";
import { useDemo } from "@/components/demo-provider";
import { generateGamePaymentLink } from "@/lib/circles";

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 75; // ~5 min window

interface CashoutModalProps {
  address: string;
  currentBalance: number;
  /** Called when the cashout completes (payoutTxHash available) or after demo cashout. */
  onCashedOut?: (newBalance: number) => void;
  onClose: () => void;
  /** Resume an existing session by token — skips the amount-input screen and
   *  jumps straight to polling + payment UI. Used when the user closed the
   *  modal mid-flight and wants to pick back up from the indicator banner. */
  resumedToken?: string;
}

/** localStorage key for per-address pending cashout session metadata. */
export function cashoutPendingKey(address: string): string {
  return `nfs_cashout_pending_${address.toLowerCase()}`;
}

export type PendingCashoutStored = {
  token: string;
  amountCrc: number;
  expiresAt: string;
  createdAt: string;
};

type Session = {
  id?: number;
  token: string;
  amountCrc: number;
  paymentLink: string;
  qrCode: string;
  recipientAddress: string;
  expiresAt: string;
};

type Status = {
  status: "pending" | "paid" | "completed" | "failed" | "expired" | "not_found";
  amountCrc?: number;
  address?: string | null;
  proofTxHash?: string | null;
  payoutTxHash?: string | null;
  refundTxHash?: string | null;
  error?: string | null;
};

export function CashoutModal({
  address,
  currentBalance,
  onCashedOut,
  onClose,
  resumedToken,
}: CashoutModalProps) {
  const { locale } = useLocale();
  const { isMiniApp, sendPayment } = useMiniApp();
  const { isDemo, debitDemoBalance } = useDemo();
  const t = translations.wallet;

  const [amountStr, setAmountStr] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [miniAppPaying, setMiniAppPaying] = useState(false);
  const [miniAppError, setMiniAppError] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);

  const pollCountRef = useRef(0);

  // Persist / clear localStorage marker for in-flight cashouts so the
  // indicator banner in WalletBalanceCard knows whether to render.
  const saveLocalPending = useCallback((s: Session) => {
    if (typeof window === "undefined") return;
    const payload: PendingCashoutStored = {
      token: s.token,
      amountCrc: s.amountCrc,
      expiresAt: s.expiresAt,
      createdAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(cashoutPendingKey(address), JSON.stringify(payload));
    } catch {
      /* storage quota / privacy mode — silent */
    }
  }, [address]);

  const clearLocalPending = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(cashoutPendingKey(address));
    } catch {
      /* silent */
    }
  }, [address]);

  // Amount validation — min 1, capped at balance.
  const amount = parseFloat(amountStr);
  const amountValid = !isNaN(amount) && amount >= 1 && amount <= currentBalance;
  const amountDisplay = amountValid ? amount.toFixed(2).replace(/\.00$/, "") : "";

  // Escape to close (only when not mid-flight)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Poll cashout-status once we have a session + user has acted (paid or in miniapp).
  const pollStatus = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch(`/api/wallet/cashout-status?token=${encodeURIComponent(session.token)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setStatus(data);
      if (data.status === "completed") {
        // The user balance drop isn't directly returned; compute it.
        onCashedOut?.(currentBalance - session.amountCrc);
      }
    } catch {
      // silent, next tick retries
    }
  }, [session, onCashedOut, currentBalance]);

  useEffect(() => {
    if (!session || !status) return;
    if (status.status === "completed" || status.status === "failed" || status.status === "expired") {
      // Terminal state — stop polling and clear the pending marker so the
      // banner in WalletBalanceCard doesn't keep prompting to "Reprendre"
      // a session that has nothing to resume.
      clearLocalPending();
      return;
    }
    pollCountRef.current += 1;
    if (pollCountRef.current > MAX_POLLS) return;
    const timer = setTimeout(pollStatus, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [status, session, pollStatus, clearLocalPending]);

  // Resume path — when a resumedToken is passed, hydrate the session from
  // status + regenerate the Gnosis payment link client-side (it's a pure
  // function of Safe address + token), so the user lands straight on the
  // payment/waiting screen without going through the amount-input flow.
  useEffect(() => {
    if (!resumedToken || session) return;
    let active = true;
    (async () => {
      try {
        const [statusRes, cfgRes] = await Promise.all([
          fetch(`/api/wallet/cashout-status?token=${encodeURIComponent(resumedToken)}`, { cache: "no-store" }),
          fetch("/api/wallet/config", { cache: "no-store" }),
        ]);
        const statusData = await statusRes.json();
        const cfgData = await cfgRes.json();

        if (!active) return;

        // If the session is already terminal, drop straight into the
        // success / failure / expired screen. Also purge the stale marker.
        if (["completed", "failed", "expired", "not_found"].includes(statusData?.status)) {
          setStatus(statusData);
          clearLocalPending();
          return;
        }

        const safeAddress = cfgData?.safeAddress;
        if (!safeAddress) {
          setError(t.error[locale]);
          return;
        }

        const paymentLink = generateGamePaymentLink(safeAddress, 1, "nf_cashout", resumedToken);
        let qrCode = "";
        try {
          const { toDataURL } = await import("qrcode");
          qrCode = await toDataURL(paymentLink, { width: 300, margin: 2 });
        } catch { /* best-effort */ }

        const s: Session = {
          token: resumedToken,
          amountCrc: Number(statusData.amountCrc) || 0,
          paymentLink,
          qrCode,
          recipientAddress: safeAddress,
          expiresAt: statusData.expiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        };
        setSession(s);
        setStatus(statusData);
        pollCountRef.current = 0;
        setTimeout(() => pollStatus(), 1500);
      } catch {
        if (active) setError(t.error[locale]);
      }
    })();
    return () => { active = false; };
  }, [resumedToken, session, locale, t, pollStatus, clearLocalPending]);

  async function handleStart() {
    if (!amountValid || loading) return;
    setLoading(true);
    setError(null);
    try {
      // Demo path — instant debit, no API, no on-chain.
      if (isDemo) {
        const ok = debitDemoBalance(amount);
        if (!ok) {
          setError(t.cashoutOverBalance[locale]);
          return;
        }
        setStatus({ status: "completed", amountCrc: amount });
        onCashedOut?.(currentBalance - amount);
        return;
      }

      const res = await fetch("/api/wallet/cashout-init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountCrc: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(mapInitError(data?.error || "error", data, locale));
        return;
      }
      setSession(data);
      setStatus({ status: "pending" });
      pollCountRef.current = 0;
      // Persist so WalletBalanceCard can show a "pending cashout" banner if
      // the user closes the modal before the flow completes.
      saveLocalPending(data);
      // Immediate poll so the user sees activity if they paid fast.
      setTimeout(() => pollStatus(), 1500);
    } catch (err: any) {
      setError(err?.message || "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleMiniAppPay() {
    if (!session) return;
    setMiniAppPaying(true);
    setMiniAppError(null);
    try {
      // Pay 1 CRC proof with data `nf_cashout:{token}`.
      await sendPayment(session.recipientAddress, 1, `nf_cashout:${session.token}`);
      // Kick off polling — scan will pick it up within a few seconds.
      pollCountRef.current = 0;
      setTimeout(() => pollStatus(), 2000);
    } catch (err: any) {
      setMiniAppError(typeof err === "string" ? err : err?.message || t.rejected[locale]);
    } finally {
      setMiniAppPaying(false);
    }
  }

  async function copyLink() {
    if (!session?.paymentLink) return;
    await navigator.clipboard.writeText(session.paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    setTimeout(() => pollStatus(), 3000);
  }

  const isCompleted = status?.status === "completed";
  const isFailed = status?.status === "failed" || status?.status === "expired";
  const waiting = session && !isCompleted && !isFailed;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16, backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-ink/10 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink/5">
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <ArrowDownCircle className="h-4 w-4" /> {t.cashoutTitle[locale]}
          </h2>
          <button onClick={onClose} className="text-ink/50 hover:text-ink transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Success screen */}
          {isCompleted && (
            <div className="text-center py-6 space-y-3">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-lg font-bold text-ink">
                {t.cashoutSuccess[locale].replace("%AMOUNT%", (status?.amountCrc ?? amount).toFixed(2))}
              </p>
              {status?.payoutTxHash && (
                <p className="text-[11px] font-mono text-ink/40 break-all">
                  {status.payoutTxHash}
                </p>
              )}
              <Button onClick={onClose} className="w-full">{t.close[locale]}</Button>
            </div>
          )}

          {/* Failure screen */}
          {isFailed && (
            <div className="text-center py-6 space-y-3">
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
              <p className="text-sm font-semibold text-ink">
                {status?.status === "expired" ? t.cashoutExpired[locale] : t.cashoutFailed[locale]}
              </p>
              {status?.error && <p className="text-xs text-ink/50 break-all">{status.error}</p>}
              <Button onClick={onClose} variant="outline" className="w-full">{t.close[locale]}</Button>
            </div>
          )}

          {/* Initial screen — amount input */}
          {!session && !isCompleted && !isFailed && (
            <>
              <p className="text-sm text-ink/60 leading-relaxed">
                {t.cashoutDesc[locale]}
              </p>

              <div className="rounded-xl bg-marine/[0.05] border border-marine/15 p-3 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-ink/40">
                  {t.available[locale]}
                </p>
                <p className="text-2xl font-black text-marine tabular-nums">
                  {currentBalance.toFixed(2)} CRC
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest text-ink/40">
                  {t.cashoutAmountLabel[locale]}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={currentBalance}
                    step={0.01}
                    value={amountStr}
                    onChange={e => setAmountStr(e.target.value)}
                    placeholder={t.amountPlaceholder[locale]}
                    disabled={loading}
                    className="w-full px-4 py-3 pr-14 rounded-xl border border-ink/15 bg-white text-base font-semibold text-ink focus:outline-none focus:border-marine focus:ring-2 focus:ring-marine/20 disabled:opacity-50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink/40">
                    CRC
                  </span>
                </div>
                <div className="flex justify-between text-xs text-ink/40">
                  <span>{t.cashoutMinHint[locale]}</span>
                  <button
                    type="button"
                    onClick={() => setAmountStr(currentBalance.toFixed(2))}
                    className="font-semibold text-marine hover:underline"
                  >
                    {t.cashoutMax[locale]}
                  </button>
                </div>
                {amountStr && !amountValid && (
                  <p className="text-xs font-semibold text-red-500">
                    {parseFloat(amountStr) > currentBalance ? t.cashoutOverBalance[locale] : t.invalidAmount[locale]}
                  </p>
                )}
              </div>

              {!isDemo && (
                <p className="text-xs text-ink/50 leading-relaxed rounded-lg bg-ink/[0.03] p-3">
                  {t.cashoutProofExplainer[locale]}
                </p>
              )}

              <Button
                onClick={handleStart}
                disabled={!amountValid || loading}
                className="w-full bg-marine hover:bg-marine/90 text-white"
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t.preparing[locale]}</>
                ) : (
                  t.cashoutStartBtn[locale].replace("%AMOUNT%", amountDisplay)
                )}
              </Button>
              {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
            </>
          )}

          {/* Payment screen — session active, waiting for proof + completion */}
          {waiting && session && (
            <div className="space-y-3">
              <div className="rounded-xl bg-marine/[0.05] border border-marine/15 p-3 text-center space-y-1">
                <p className="text-xs font-bold uppercase tracking-widest text-ink/40">
                  {t.cashoutAmountConfirm[locale]}
                </p>
                <p className="text-2xl font-black text-marine tabular-nums">
                  {session.amountCrc.toFixed(2)} CRC
                </p>
              </div>

              <p className="text-sm text-ink/60 leading-relaxed">
                {t.cashoutProofInstructions[locale]}
              </p>

              {isMiniApp && (
                <div className="space-y-2">
                  <Button
                    onClick={handleMiniAppPay}
                    disabled={miniAppPaying}
                    className="w-full bg-marine hover:bg-marine/90 text-white"
                  >
                    {miniAppPaying ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t.preparing[locale]}</>
                    ) : (
                      t.cashoutPayProofBtn[locale]
                    )}
                  </Button>
                  {miniAppError && <p className="text-xs text-red-500 font-semibold">{miniAppError}</p>}
                </div>
              )}

              {!isMiniApp && (
                <div className="space-y-2">
                  <a
                    href={session.paymentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setTimeout(pollStatus, 3000)}
                    className="block w-full text-center py-3 rounded-xl bg-marine text-white text-sm font-semibold hover:opacity-90"
                  >
                    {t.cashoutPayProofBtn[locale]}
                  </a>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowQr(s => !s)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-ink/15 text-ink/70 text-xs font-semibold hover:border-ink/30"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      {t.scanQr[locale]}
                    </button>
                    <button
                      onClick={copyLink}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-ink/15 text-ink/70 text-xs font-semibold hover:border-ink/30"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? t.copied[locale] : t.copyLink[locale]}
                    </button>
                  </div>
                  {showQr && session.qrCode && (
                    <div className="flex justify-center py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={session.qrCode} alt="QR" className="rounded-lg border border-ink/10" />
                    </div>
                  )}
                </div>
              )}

              {/* Status feedback */}
              <div className="rounded-xl bg-marine/[0.03] border border-marine/10 p-3 text-center space-y-2">
                <Loader2 className="h-5 w-5 animate-spin text-marine mx-auto" />
                <p className="text-sm font-semibold text-marine">
                  {status?.status === "paid" ? t.cashoutProcessing[locale] : t.cashoutWaitingProof[locale]}
                </p>
                <button
                  onClick={pollStatus}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-marine/70 hover:text-marine"
                >
                  <RefreshCw className="h-3 w-3" />
                  {t.scanNow[locale]}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function mapInitError(code: string, data: any, locale: "fr" | "en"): string {
  const t = translations.wallet;
  switch (code) {
    case "below_minimum":
      return locale === "fr"
        ? `Le minimum est ${data?.minimum || 1} CRC`
        : `Minimum is ${data?.minimum || 1} CRC`;
    case "above_maximum":
      return locale === "fr"
        ? `Le maximum est ${data?.maximum || 1000} CRC`
        : `Maximum is ${data?.maximum || 1000} CRC`;
    case "invalid_amount":
      return t.invalidAmount[locale];
    case "safe_address_missing":
      return locale === "fr" ? "Configuration serveur manquante" : "Server configuration missing";
    case "rate_limited":
      return locale === "fr"
        ? `Trop de tentatives. R\u00e9essayez dans ${data?.retryAfterSec || 60}s.`
        : `Too many attempts. Try again in ${data?.retryAfterSec || 60}s.`;
    default:
      return t.error[locale];
  }
}
