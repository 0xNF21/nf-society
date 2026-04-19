"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { X, Copy, Check, Loader2, QrCode, RefreshCw, CheckCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateTopupPaymentLink } from "@/lib/circles";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { useMiniApp } from "@/components/miniapp-provider";
import { useDemo } from "@/components/demo-provider";

const SAFE_ADDRESS_FALLBACK = "0x960A0784640fD6581D221A56df1c60b65b5ebB6f";
const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 60; // 5 min window

interface TopupModalProps {
  address: string;
  /** Called when a topup is credited on-chain and the API reports a new balance. */
  onCredited?: (newBalance: number) => void;
  onClose: () => void;
}

export function TopupModal({ address, onCredited, onClose }: TopupModalProps) {
  const { locale } = useLocale();
  const { isMiniApp, sendPayment } = useMiniApp();
  const { isDemo, creditDemoBalance } = useDemo();
  const t = translations.wallet;

  const [recipient, setRecipient] = useState(SAFE_ADDRESS_FALLBACK);
  const [amountStr, setAmountStr] = useState("");
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [miniAppPaying, setMiniAppPaying] = useState(false);
  const [miniAppError, setMiniAppError] = useState<string | null>(null);
  const [watching, setWatching] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [creditedAmount, setCreditedAmount] = useState<number | null>(null);

  const baselineBalanceRef = useRef<number | null>(null);
  const pollCountRef = useRef(0);

  // Pull the real SAFE_ADDRESS from config once, fallback to the hardcoded
  // value if unavailable (env not set, network error, etc.).
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/wallet/config", { cache: "no-store" });
        const data = await res.json();
        if (data?.safeAddress) setRecipient(data.safeAddress);
      } catch {
        // keep fallback
      }
    })();
  }, []);

  // Compute + validate amount
  const amount = parseFloat(amountStr);
  const amountValid = !isNaN(amount) && amount >= 1 && amount <= 1000;
  const amountDisplay = amountValid ? amount.toFixed(2).replace(/\.00$/, "") : "";
  const paymentLink = amountValid ? generateTopupPaymentLink(recipient, amount) : "";

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Generate QR when requested (standalone only)
  useEffect(() => {
    if (isMiniApp) return;
    if (!showQr || !paymentLink) return;
    let active = true;
    setQrState("loading");
    (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const url = await toDataURL(paymentLink, { width: 220, margin: 1 });
        if (active) { setQrCode(url); setQrState("ready"); }
      } catch {
        if (active) { setQrCode(""); setQrState("error"); }
      }
    })();
    return () => { active = false; };
  }, [showQr, paymentLink, isMiniApp]);

  // Polling when "watching" is active
  const pollScan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/wallet/topup-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const data = await res.json();
      if (typeof data.balanceCrc === "number") {
        if (baselineBalanceRef.current === null) {
          baselineBalanceRef.current = data.balanceCrc;
        } else if (data.balanceCrc > baselineBalanceRef.current) {
          const delta = data.balanceCrc - baselineBalanceRef.current;
          setCreditedAmount(delta);
          setWatching(false);
          onCredited?.(data.balanceCrc);
        }
      }
    } catch {
      // Silent retry on next tick
    } finally {
      setScanning(false);
    }
  }, [address, onCredited]);

  useEffect(() => {
    if (!watching) return;
    // First scan immediately, then every POLL_INTERVAL_MS
    pollScan();
    const interval = setInterval(() => {
      pollCountRef.current += 1;
      if (pollCountRef.current > MAX_POLLS) {
        setWatching(false);
        return;
      }
      pollScan();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [watching, pollScan]);

  async function handleMiniAppPay() {
    if (!amountValid) return;
    setMiniAppPaying(true);
    setMiniAppError(null);
    try {
      await sendPayment(recipient, amount, "wallet:topup");
      // Kick off polling
      baselineBalanceRef.current = null; // will be set on first poll
      pollCountRef.current = 0;
      setWatching(true);
    } catch (err: any) {
      setMiniAppError(typeof err === "string" ? err : err?.message || t.rejected[locale]);
    } finally {
      setMiniAppPaying(false);
    }
  }

  /**
   * Arm the scan poller. Called on any user action that signals "I'm about
   * to pay" — clicking the Gnosis link, revealing the QR, or copying the
   * link. All three lead to a payment that the user makes outside the
   * browser (mobile app, other device), so we can't rely on an explicit
   * "I paid" callback. We start polling eagerly and stop on close.
   */
  function armWatching() {
    if (watching) return;
    baselineBalanceRef.current = null;
    pollCountRef.current = 0;
    setWatching(true);
  }

  async function copyLink() {
    if (!paymentLink) return;
    await navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    armWatching();
  }

  const isSuccess = creditedAmount !== null;

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
            <Wallet className="h-4 w-4" /> {t.topupTitle[locale]}
          </h2>
          <button onClick={onClose} className="text-ink/50 hover:text-ink transition-colors" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {isSuccess ? (
            // Success screen
            <div className="text-center py-6 space-y-3">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-lg font-bold text-ink">
                {t.credited[locale].replace("%AMOUNT%", creditedAmount.toFixed(2))}
              </p>
              <Button onClick={onClose} className="w-full">
                {t.close[locale]}
              </Button>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink/60 leading-relaxed">{t.topupDesc[locale]}</p>

              {/* Amount input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest text-ink/40">
                  {t.amountLabel[locale]}
                </label>
                <div className="relative">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={1000}
                    step={0.01}
                    value={amountStr}
                    onChange={e => setAmountStr(e.target.value)}
                    placeholder={t.amountPlaceholder[locale]}
                    disabled={watching || miniAppPaying}
                    className="w-full px-4 py-3 pr-14 rounded-xl border border-ink/15 bg-white text-base font-semibold text-ink focus:outline-none focus:border-marine focus:ring-2 focus:ring-marine/20 disabled:opacity-50"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-ink/40">
                    CRC
                  </span>
                </div>
                <p className="text-xs text-ink/40">{t.amountHint[locale]}</p>
                {amountStr && !amountValid && (
                  <p className="text-xs font-semibold text-red-500">{t.invalidAmount[locale]}</p>
                )}
              </div>

              {/* Demo path — instant credit, no API, no on-chain */}
              {isDemo && amountValid && (
                <Button
                  onClick={() => {
                    const newBalance = creditDemoBalance(amount);
                    setCreditedAmount(amount);
                    onCredited?.(newBalance);
                  }}
                  className="w-full bg-marine hover:bg-marine/90 text-white"
                >
                  {t.payBtn[locale].replace("%AMOUNT%", amountDisplay)} (demo)
                </Button>
              )}

              {/* Mini App path — payment options stay visible during watching
                  so the user can retry if the tx was rejected. */}
              {!isDemo && isMiniApp && amountValid && (
                <div className="space-y-2">
                  <Button
                    onClick={handleMiniAppPay}
                    disabled={miniAppPaying}
                    className="w-full bg-marine hover:bg-marine/90 text-white"
                  >
                    {miniAppPaying ? (
                      <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t.preparing[locale]}</>
                    ) : (
                      t.payBtn[locale].replace("%AMOUNT%", amountDisplay)
                    )}
                  </Button>
                  {miniAppError && <p className="text-xs text-red-500 font-semibold">{miniAppError}</p>}
                </div>
              )}

              {/* Standalone path — payment options stay visible during watching
                  so QR + link remain usable if the user scans from a phone. */}
              {!isDemo && !isMiniApp && amountValid && (
                <div className="space-y-2">
                  <a
                    href={paymentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={armWatching}
                    className="block w-full text-center py-3 rounded-xl bg-marine text-white text-sm font-semibold hover:opacity-90"
                  >
                    {t.openGnosis[locale]}
                  </a>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowQr(s => !s);
                        armWatching();
                      }}
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
                  {showQr && (
                    <div className="flex justify-center py-2">
                      {qrState === "loading" && <Loader2 className="h-8 w-8 animate-spin text-ink/30" />}
                      {qrState === "ready" && qrCode && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qrCode} alt="QR" className="rounded-lg border border-ink/10" />
                      )}
                      {qrState === "error" && <p className="text-xs text-red-500">{t.error[locale]}</p>}
                    </div>
                  )}
                </div>
              )}

              {/* Watching banner — shown BELOW payment options while polling. */}
              {watching && !isDemo && (
                <div className="rounded-xl bg-marine/[0.05] border border-marine/20 p-3 text-center space-y-2">
                  <Loader2 className="h-5 w-5 animate-spin text-marine mx-auto" />
                  <p className="text-sm font-semibold text-marine">{t.watching[locale]}</p>
                  <button
                    onClick={pollScan}
                    disabled={scanning}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-marine/70 hover:text-marine disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${scanning ? "animate-spin" : ""}`} />
                    {scanning ? t.scanning[locale] : t.scanNow[locale]}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
