"use client";

import { useState, useEffect, useCallback } from "react";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import ScratchCard from "@/components/scratch-card";
import SpinWheel from "@/components/spin-wheel";
import { X, Copy, Check, Loader2, Sparkles, ChevronDown, Wallet } from "lucide-react";
import { useMiniApp } from "@/components/miniapp-provider";
import { useConnectedAddress } from "@/hooks/use-connected-address";

type Phase = "init" | "payment" | "scratch" | "spin" | "complete";

export default function DailyModal() {
  const { locale } = useLocale();
  const { isDemo, addXp, addStreak } = useDemo();
  const { isMiniApp, walletAddress, sendPayment } = useMiniApp();
  const connectedAddress = useConnectedAddress();
  const t = translations.daily;
  const tm = translations.miniapp;
  const tw = translations.wallet;

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("init");
  const [token, setToken] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [address, setAddress] = useState<string | null>(null);
  const [miniAppPaying, setMiniAppPaying] = useState(false);
  const [miniAppError, setMiniAppError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [scratchResult, setScratchResult] = useState<any>(null);
  const [spinResult, setSpinResult] = useState<any>(null);
  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showProbs, setShowProbs] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [claimingFromBalance, setClaimingFromBalance] = useState(false);
  const [balanceClaimError, setBalanceClaimError] = useState<string | null>(null);

  // Fermer avec Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Listen for custom event from /chance page
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-daily-modal", handler);
    return () => window.removeEventListener("open-daily-modal", handler);
  }, []);


  // Check localStorage for existing session on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("nf-daily");
      if (!stored) return;
      const data = JSON.parse(stored);
      const today = new Date().toISOString().slice(0, 10);
      if (data.date !== today) {
        localStorage.removeItem("nf-daily");
        return;
      }
      setToken(data.token);
      setAddress(data.address);
      // Check session status
      fetch(`/api/daily/session?token=${data.token}`)
        .then(r => r.json())
        .then(session => {
          if (session.status === "confirmed") {
            if (session.scratchPlayed && session.spinPlayed) {
              setScratchResult(session.scratchResult);
              setSpinResult(session.spinResult);
              setPhase("complete");
            } else if (session.scratchPlayed && !session.spinPlayed) {
              setScratchResult(session.scratchResult);
              setPhase("spin");
            } else {
              setPhase("scratch");
            }
          } else if (session.status === "waiting") {
            if (session.paymentLink) {
              setPaymentLink(session.paymentLink);
              import("qrcode").then(QRCode => {
                QRCode.toDataURL(session.paymentLink, { width: 300, margin: 2 })
                  .then((url: string) => setQrCode(url))
                  .catch(() => {});
              });
            }
            setPhase("payment");
          }
        })
        .catch(() => {});
    } catch { /* localStorage error */ }
  }, []);

  // Poll for payment — call scan first, then check session
  useEffect(() => {
    if (phase !== "payment" || !token || !open) return;

    const poll = async () => {
      try {
        // 1. Trigger scan directly from frontend (reliable, no self-HTTP issue)
        await fetch("/api/daily/scan", { method: "POST" }).catch(() => {});

        // 2. Check session status
        const res = await fetch(`/api/daily/session?token=${token}`);
        const data = await res.json();

        if (data.status === "confirmed") {
          setAddress(data.address);
          localStorage.setItem("nf-daily", JSON.stringify({
            token,
            address: data.address,
            date: new Date().toISOString().slice(0, 10),
          }));
          setPhase("scratch");
        } else if (data.status === "expired") {
          setPhase("init");
          setToken(null);
        }
      } catch { /* retry next poll */ }
    };

    // First poll immediately
    poll();
    const interval = setInterval(poll, 5000);

    return () => clearInterval(interval);
  }, [phase, token, open]);

  // Initialize session
  const handleInit = useCallback(async () => {
    setLoading(true);
    try {
      // Mini App mode: free claim with wallet address
      if (isMiniApp && walletAddress) {
        const res = await fetch("/api/daily/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: walletAddress }),
        });
        const data = await res.json();
        setToken(data.token);
        setAddress(data.address);
        localStorage.setItem("nf-daily", JSON.stringify({
          token: data.token,
          address: data.address,
          date: new Date().toISOString().slice(0, 10),
        }));

        if (data.alreadyClaimed) {
          // Resume at right phase
          if (data.scratchPlayed && data.spinPlayed) {
            setScratchResult(data.scratchResult);
            setSpinResult(data.spinResult);
            setPhase("complete");
          } else if (data.scratchPlayed) {
            setScratchResult(data.scratchResult);
            setPhase("spin");
          } else {
            setPhase("scratch");
          }
        } else {
          setPhase("scratch");
        }
        setLoading(false);
        return;
      }

      // Standalone mode: payment required
      const res = await fetch("/api/daily/init", { method: "POST" });
      const data = await res.json();
      setToken(data.token);

      if (data.alreadyConfirmed) {
        // User already paid today — go straight to session check
        localStorage.setItem("nf-daily", JSON.stringify({
          token: data.token,
          date: new Date().toISOString().slice(0, 10),
        }));
        // Fetch full session to resume at right phase
        const sRes = await fetch(`/api/daily/session?token=${data.token}`);
        const session = await sRes.json();
        if (session.status === "confirmed") {
          setAddress(session.address);
          if (session.scratchPlayed && session.spinPlayed) {
            setScratchResult(session.scratchResult);
            setSpinResult(session.spinResult);
            setPhase("complete");
          } else if (session.scratchPlayed) {
            setScratchResult(session.scratchResult);
            setPhase("spin");
          } else {
            setPhase("scratch");
          }
        }
      } else {
        setPaymentLink(data.paymentLink);
        setQrCode(data.qrCode);
        setPhase("payment");
        localStorage.setItem("nf-daily", JSON.stringify({
          token: data.token,
          date: new Date().toISOString().slice(0, 10),
        }));
      }
    } catch { /* error */ }
    setLoading(false);
  }, [isMiniApp, walletAddress]);

  // Play scratch
  const handleScratch = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/daily/scratch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      setScratchResult(data.result);
    } catch { /* error */ }
  }, [token]);

  // Load scratch result when entering scratch phase
  useEffect(() => {
    if (phase === "scratch" && !scratchResult) {
      handleScratch();
    }
  }, [phase, scratchResult, handleScratch]);

  // Play spin
  const handleSpin = useCallback(async () => {
    if (!token || spinning) return;
    setSpinning(true);
    try {
      const res = await fetch("/api/daily/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      setSpinResult(data.result);
    } catch {
      setSpinning(false);
    }
  }, [token, spinning]);

  const handleMiniAppPay = useCallback(async () => {
    if (!paymentLink) return;
    setMiniAppPaying(true);
    setMiniAppError(null);
    try {
      // Extract recipient from payment link: https://app.gnosis.io/transfer/{address}/crc?...
      const match = paymentLink.match(/transfer\/(0x[a-fA-F0-9]+)\//);
      const recipient = match?.[1] || "";
      await sendPayment(recipient, 1, `daily:${token}`);
      // Payment sent — poll will detect it
    } catch (err: any) {
      setMiniAppError(typeof err === "string" ? err : err?.message || tm.rejected[locale]);
    } finally {
      setMiniAppPaying(false);
    }
  }, [paymentLink, token, sendPayment, tm, locale]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [paymentLink]);

  // Fetch wallet balance when entering the payment phase with a known address.
  useEffect(() => {
    if (isDemo) return;
    if (phase !== "payment") return;
    if (!connectedAddress) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/wallet/balance?address=${encodeURIComponent(connectedAddress)}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (active && typeof data.balanceCrc === "number") setWalletBalance(data.balanceCrc);
      } catch { /* silent */ }
    })();
    return () => { active = false; };
  }, [phase, connectedAddress, isDemo]);

  // Claim daily from wallet balance — no CRC movement, just confirms the session.
  const handleBalanceClaim = useCallback(async () => {
    if (!connectedAddress || claimingFromBalance) return;
    setClaimingFromBalance(true);
    setBalanceClaimError(null);
    try {
      const res = await fetch("/api/daily/claim-from-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: connectedAddress }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBalanceClaimError(
          data?.error === "no_balance"
            ? (locale === "fr" ? "Chargez d'abord votre solde" : "Top up your balance first")
            : (locale === "fr" ? "Echec — reessayez" : "Failed — try again"),
        );
        return;
      }
      // Session confirmed — transition like the on-chain poll would.
      setAddress(connectedAddress);
      setToken(data.token);
      try {
        localStorage.setItem("nf-daily", JSON.stringify({
          token: data.token,
          address: connectedAddress,
          date: new Date().toISOString().slice(0, 10),
        }));
      } catch { /* ignore */ }

      // Route to the right phase based on what's already played today.
      const s = data.session || {};
      if (s.scratchPlayed && s.spinPlayed) setPhase("complete");
      else if (s.scratchPlayed) setPhase("spin");
      else setPhase("scratch");
    } catch (err: any) {
      setBalanceClaimError(err?.message || (locale === "fr" ? "Erreur" : "Error"));
    } finally {
      setClaimingFromBalance(false);
    }
  }, [connectedAddress, claimingFromBalance, locale]);

  // Demo mode — simulate payment + generate fake results client-side
  const handleDemo = useCallback(() => {
    const demoToken = "DEMO-" + Math.random().toString(36).slice(2, 8);
    setToken(demoToken);
    setAddress("0xdemo");

    // Award XP for daily check-in + streak
    addXp("daily_checkin");
    addStreak();

    // Fake scratch result
    const scratchSymbols = ["🪙", "🪙", "💨"];
    setScratchResult({
      type: "refund",
      label: "Remboursé !",
      crcValue: 1,
      xpValue: 5,
      symbols: scratchSymbols,
    });

    // Fake spin result
    setSpinResult({
      type: "crc_1",
      label: "+1 CRC",
      crcValue: 1,
      xpValue: 5,
      segmentIndex: 2,
    });

    // Award XP for scratch + spin
    addXp("daily_scratch");
    addXp("daily_spin");

    setPhase("scratch");
  }, [addXp, addStreak]);

  return (
    <>
      {/* ─── Modal overlay ─── */}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            backgroundColor: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(4px)",
          }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl border border-ink/10 overflow-hidden"
            style={{ maxHeight: "85vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink/5 bg-gradient-to-r from-amber-50 to-orange-50">
              <div className="flex items-center gap-2">
                <span className="text-xl">🎰</span>
                <h2 className="text-base font-bold text-ink">{t.title[locale]}</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-ink/50 hover:text-ink transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content */}
            <div className="px-5 py-4">

              {/* Jackpot bar — disabled, will be reimplemented as independent system */}

              {/* ─── PHASE: INIT ─── */}
              {phase === "init" && (
                <div className="text-center py-6">
                  <p className="text-ink/60 text-sm mb-4">{t.subtitle[locale]}</p>
                  <button
                    onClick={isDemo && process.env.NODE_ENV === "development" ? handleDemo : handleInit}
                    disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl text-base shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] disabled:opacity-50"
                  >
                    {loading ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : isDemo ? (
                      "🧪 " + t.payButton[locale]
                    ) : (
                      t.payButton[locale]
                    )}
                  </button>
                  {!isDemo && process.env.NODE_ENV === "development" && (
                  <button
                    onClick={handleDemo}
                    className="w-full mt-3 py-2.5 bg-ink/5 hover:bg-ink/10 text-ink/60 font-medium rounded-xl text-sm transition-colors"
                  >
                    🧪 Demo ({locale === "fr" ? "tester sans payer" : "test without paying"})
                  </button>
                  )}

                  {/* Probability dropdown */}
                  <div className="mt-4 text-left">
                    <button
                      onClick={() => setShowProbs(!showProbs)}
                      className="w-full flex items-center justify-between py-2.5 px-3 bg-ink/[0.03] hover:bg-ink/[0.06] rounded-xl transition-colors"
                    >
                      <span className="text-sm font-medium text-ink/60">
                        {locale === "fr" ? "Voir les probabilités" : "View probabilities"}
                      </span>
                      <ChevronDown className={`w-4 h-4 text-ink/40 transition-transform ${showProbs ? "rotate-180" : ""}`} />
                    </button>

                    {showProbs && (
                      <div className="mt-2 space-y-3 text-xs">
                        {/* Scratch Card */}
                        <div className="bg-ink/[0.02] rounded-xl p-3 border border-ink/5">
                          <h4 className="font-bold text-ink/70 mb-2">🎫 {locale === "fr" ? "Carte à gratter" : "Scratch Card"}</h4>
                          <div className="space-y-1">
                            {[
                              { emoji: "💨", label: locale === "fr" ? "Rien" : "Nothing", prob: "20%" },
                              { emoji: "⭐", label: "+50 XP", prob: "15%" },
                              { emoji: "🪙", label: locale === "fr" ? "Remboursé (1 CRC)" : "Refund (1 CRC)", prob: "33%" },
                              { emoji: "🌟", label: "+100 XP", prob: "13.2%" },
                              { emoji: "💰", label: "+2 CRC", prob: "10.8%" },
                              { emoji: "🔥", label: "Streak x2", prob: "4%" },
                              { emoji: "💎", label: "+5 CRC", prob: "3.2%" },
                              { emoji: "👑", label: "+20 CRC", prob: "0.8%" },
                            ].map((row) => (
                              <div key={row.label} className="flex items-center justify-between py-0.5">
                                <span className="text-ink/60">{row.emoji} {row.label}</span>
                                <span className="font-mono font-medium text-ink/50">{row.prob}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Spin Wheel */}
                        <div className="bg-ink/[0.02] rounded-xl p-3 border border-ink/5">
                          <h4 className="font-bold text-ink/70 mb-2">🎰 {locale === "fr" ? "Roue du jour" : "Daily Spin"}</h4>
                          <div className="space-y-1">
                            {[
                              { color: "#6B7280", label: locale === "fr" ? "Rien" : "Nothing", prob: "20%" },
                              { color: "#8B5CF6", label: "+50 XP", prob: "15%" },
                              { color: "#10B981", label: "+1 CRC", prob: "30%" },
                              { color: "#6366F1", label: "+100 XP", prob: "13%" },
                              { color: "#F59E0B", label: "+3 CRC", prob: "13%" },
                              { color: "#EF4444", label: "Streak x2", prob: "5%" },
                              { color: "#EC4899", label: "+10 CRC", prob: "3%" },
                              { color: "#FFD700", label: "JACKPOT", prob: "1%" },
                            ].map((row) => (
                              <div key={row.label} className="flex items-center justify-between py-0.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: row.color }} />
                                  <span className="text-ink/60">{row.label}</span>
                                </div>
                                <span className="font-mono font-medium text-ink/50">{row.prob}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ─── PHASE: PAYMENT ─── */}
              {phase === "payment" && (
                <div className="text-center py-2">
                  {/* Claim-from-balance — shown above the on-chain flow when
                      the connected address has any balance. Daily is already
                      free on-chain (1 CRC charged, 1 CRC refunded) so the
                      balance path just confirms the session with no CRC
                      movement. */}
                  {connectedAddress && walletBalance !== null && walletBalance > 0 && (
                    <div className="mb-4 rounded-2xl border border-marine/20 bg-gradient-to-br from-marine/[0.04] to-citrus/[0.04] p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-ink/50">
                          <Wallet className="h-3.5 w-3.5" />
                          {tw.payWithBalance[locale]}
                        </span>
                        <span className="text-xs text-ink/50 tabular-nums">
                          {walletBalance.toFixed(2)} CRC {tw.available[locale]}
                        </span>
                      </div>
                      <button
                        onClick={handleBalanceClaim}
                        disabled={claimingFromBalance}
                        className="w-full py-3 rounded-xl bg-marine text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
                      >
                        {claimingFromBalance ? (
                          <span className="inline-flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            {tw.paying[locale]}
                          </span>
                        ) : (
                          locale === "fr" ? "Reclamer mon daily (gratuit)" : "Claim my daily (free)"
                        )}
                      </button>
                      {balanceClaimError && <p className="text-xs text-red-500 font-semibold">{balanceClaimError}</p>}
                      <p className="text-[11px] text-ink/40">
                        {locale === "fr" ? "Aucun CRC debite (daily est gratuit)." : "No CRC debited (daily is free)."}
                      </p>
                    </div>
                  )}

                  {isMiniApp && walletAddress ? (
                    <>
                      <button
                        onClick={handleMiniAppPay}
                        disabled={miniAppPaying}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl text-sm shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] mb-3 disabled:opacity-50"
                      >
                        {miniAppPaying ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />{tm.paying[locale]}</>
                        ) : (
                          tm.payBtn[locale].replace("{amount}", "1")
                        )}
                      </button>
                      {miniAppError && <p className="text-xs text-red-500 mb-2">{miniAppError}</p>}
                    </>
                  ) : (
                    <>
                      <p className="text-ink/60 text-sm mb-3">{t.scanQr[locale]}</p>

                      {qrCode && (
                        <div className="bg-white rounded-xl p-3 inline-block mb-3 shadow-sm border border-ink/5">
                          <img src={qrCode} alt="QR Code" className="w-40 h-40" />
                        </div>
                      )}

                      <a
                        href={paymentLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold rounded-xl text-sm shadow-lg hover:shadow-xl transition-all hover:scale-[1.02] mb-3"
                      >
                        💳 {locale === "fr" ? "Payer 1 CRC avec Circles" : "Pay 1 CRC with Circles"}
                      </a>

                      <p className="text-xs text-ink/50 mb-2">{t.orCopy[locale]}</p>

                      <button
                        onClick={copyLink}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-ink/5 hover:bg-ink/10 rounded-xl transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        <span className="text-xs font-mono truncate max-w-[220px]">
                          {copied ? t.copied[locale] : paymentLink.slice(0, 35) + "..."}
                        </span>
                      </button>
                    </>
                  )}

                  <div className="mt-4 flex items-center justify-center gap-2 text-ink/50">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-xs">{t.detecting[locale]}</span>
                  </div>
                </div>
              )}


              {/* ─── PHASE: SCRATCH ─── */}
              {phase === "scratch" && (
                <div className="text-center py-2">
                  <h3 className="text-lg font-bold mb-1">{t.scratchTitle[locale]}</h3>
                  <p className="text-ink/60 text-sm mb-4">{t.scratchInstruction[locale]}</p>

                  {scratchResult ? (
                    <ScratchCard
                      result={scratchResult}
                      onComplete={() => {
                        setTimeout(() => setPhase("spin"), 2000);
                      }}
                      locale={locale}
                    />
                  ) : (
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-amber-500" />
                  )}
                </div>
              )}

              {/* ─── PHASE: SPIN ─── */}
              {phase === "spin" && (
                <div className="text-center py-2">
                  <h3 className="text-lg font-bold mb-4">{t.spinTitle[locale]}</h3>

                  <SpinWheel
                    result={spinResult}
                    onSpin={handleSpin}
                    onComplete={() => {
                      setTimeout(() => setPhase("complete"), 2000);
                    }}
                    spinning={spinning}
                    locale={locale}
                  />
                </div>
              )}

              {/* ─── PHASE: COMPLETE ─── */}
              {phase === "complete" && (
                <div className="py-2">
                  <div className="text-center mb-4">
                    <Sparkles className="w-6 h-6 text-amber-500 mx-auto mb-1" />
                    <h3 className="text-lg font-bold">{t.summaryTitle[locale]}</h3>
                  </div>

                  <div className="space-y-2">
                    {scratchResult && (
                      <div className="bg-ink/[0.02] rounded-xl p-3 border border-ink/5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🎫</span>
                            <span className="text-sm font-medium">{t.scratchResult[locale]}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold">{scratchResult.label}</span>
                            {scratchResult.crcValue > 0 && (
                              <span className="text-xs text-amber-600 ml-1">+{scratchResult.crcValue} CRC</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {spinResult && (
                      <div className="bg-ink/[0.02] rounded-xl p-3 border border-ink/5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🎰</span>
                            <span className="text-sm font-medium">{t.spinResult[locale]}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-sm font-bold">{spinResult.label}</span>
                            {spinResult.crcValue > 0 && (
                              <span className="text-xs text-amber-600 ml-1">+{spinResult.crcValue} CRC</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-center text-ink/50 text-xs mt-4">{t.comeBack[locale]}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
