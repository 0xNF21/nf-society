"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Loader2, Sparkles, Wallet, X } from "lucide-react";
import { useDemo } from "@/components/demo-provider";
import { useLocale } from "@/components/language-provider";
import { useMiniApp } from "@/components/miniapp-provider";
import SpinWheel from "@/components/spin-wheel";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { useStakeLabel } from "@/hooks/use-stake-label";
import type { DailyWheelResult, SpinSegment } from "@/lib/daily-shared";
import { translations } from "@/lib/i18n";

type Phase = "init" | "payment" | "wheel" | "complete";

type DailyRewardEntry = {
  prob: number;
  type: string;
  label: string;
  crcValue: number;
  xpValue: number;
  color?: string;
};

type DailySessionResponse = {
  status?: string;
  token?: string;
  address?: string | null;
  paymentLink?: string;
  qrCode?: string;
  wheelPlayed?: boolean;
  wheelResult?: DailyWheelResult | null;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function DailyModal() {
  const { locale } = useLocale();
  const { isDemo, addXp, creditDemoBalance } = useDemo();
  const { isMiniApp, walletAddress, sendPayment } = useMiniApp();
  const connectedAddress = useConnectedAddress();
  const t = translations.daily;
  const tm = translations.miniapp;
  const stake = useStakeLabel();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("init");
  const [token, setToken] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [paymentLink, setPaymentLink] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [wheelResult, setWheelResult] = useState<DailyWheelResult | null>(null);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [miniAppPaying, setMiniAppPaying] = useState(false);
  const [miniAppError, setMiniAppError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showProbs, setShowProbs] = useState(false);
  const [wheelRewards, setWheelRewards] = useState<DailyRewardEntry[]>([]);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [claimingFromBalance, setClaimingFromBalance] = useState(false);
  const [balanceClaimError, setBalanceClaimError] = useState<string | null>(null);
  const [claimingFree, setClaimingFree] = useState(false);

  const wheelSegments = useMemo<SpinSegment[]>(() => (
    wheelRewards
      .filter((entry) => entry.color)
      .map((entry) => ({
        type: entry.type,
        label: entry.label,
        color: entry.color || "#6B7280",
      }))
  ), [wheelRewards]);

  const visibleCrcRewards = useMemo(() => (
    wheelRewards
      .filter((entry) => entry.crcValue > 0)
      .reduce<DailyRewardEntry[]>((unique, entry) => {
        if (!unique.some((row) => row.crcValue === entry.crcValue)) unique.push(entry);
        return unique;
      }, [])
      .sort((a, b) => a.crcValue - b.crcValue)
  ), [wheelRewards]);

  const hasXpReward = wheelRewards.some((entry) => entry.xpValue > 0);
  const arcadeLabel = useCallback((label: unknown) => (
    stake.t(String(label ?? "")).replace(/\bJACKPOT\b/g, "DOTATION")
  ), [stake]);
  const rewardLabel = useCallback((entry: DailyRewardEntry) => {
    if (entry.crcValue > 0) return `+${stake.format(entry.crcValue)}`;
    if (entry.xpValue > 0) return `+${entry.xpValue} XP de solde`;
    return arcadeLabel(entry.label || entry.type);
  }, [arcadeLabel, stake]);
  const rewardProb = (entry: DailyRewardEntry) => `${Math.round(entry.prob * 1000) / 10}%`;

  const rewardPreview = (hasXpReward || visibleCrcRewards.length > 0) ? (
    <div className="rounded-xl border border-amber-400/30 bg-amber-50/70 p-3 text-left dark:bg-amber-950/20">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[11px] font-black uppercase tracking-widest text-amber-700">
          {locale === "fr" ? "Gains possibles" : "Possible rewards"}
        </span>
        {visibleCrcRewards.length > 0 && (
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
            {locale === "fr" ? "CRC rare" : "Rare CRC"}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {hasXpReward && (
          <span className="rounded-lg bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">
            Solde XP
          </span>
        )}
        {visibleCrcRewards.map((entry) => (
          <span key={`crc-${entry.crcValue}`} className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-700">
            +{stake.format(entry.crcValue)}
          </span>
        ))}
      </div>
    </div>
  ) : null;

  const saveDailySession = useCallback((sessionToken: string, sessionAddress?: string | null) => {
    try {
      localStorage.setItem("nf-daily", JSON.stringify({
        token: sessionToken,
        address: sessionAddress || null,
        date: todayKey(),
      }));
    } catch {}
  }, []);

  const clearDailySession = useCallback(() => {
    try {
      localStorage.removeItem("nf-daily");
    } catch {}
  }, []);

  const makeQrCode = useCallback(async (link: string) => {
    if (!link) return;
    try {
      const QRCode = await import("qrcode");
      const url = await QRCode.toDataURL(link, { width: 300, margin: 2 });
      setQrCode(url);
    } catch {}
  }, []);

  const routeConfirmedSession = useCallback((session: DailySessionResponse) => {
    if (session.token) setToken(session.token);
    if (session.address) setAddress(session.address);
    if (session.token) saveDailySession(session.token, session.address);

    const result = session.wheelResult ?? null;
    setWheelResult(result);
    setWheelSpinning(false);
    setPhase(session.wheelPlayed || result ? "complete" : "wheel");
  }, [saveDailySession]);

  const handleSessionResponse = useCallback((session: DailySessionResponse) => {
    if (session.status === "confirmed") {
      routeConfirmedSession(session);
      return;
    }

    if (session.status === "waiting") {
      if (session.paymentLink) {
        setPaymentLink(session.paymentLink);
        void makeQrCode(session.paymentLink);
      }
      setPhase("payment");
      return;
    }

    if (session.status === "expired" || session.status === "not_found") {
      clearDailySession();
      setToken(null);
      setPhase("init");
    }
  }, [clearDailySession, makeQrCode, routeConfirmedSession]);

  const claimDailyFree = useCallback(async (claimAddress: string) => {
    if (claimingFree) return false;
    setClaimingFree(true);
    try {
      const res = await fetch("/api/daily/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: claimAddress }),
      });
      const data = await res.json();
      if (!res.ok || !data?.token) return false;

      routeConfirmedSession({
        status: "confirmed",
        token: data.token,
        address: data.address || claimAddress.toLowerCase(),
        wheelPlayed: data.wheelPlayed,
        wheelResult: data.wheelResult,
      });
      return true;
    } catch {
      return false;
    } finally {
      setClaimingFree(false);
    }
  }, [claimingFree, routeConfirmedSession]);

  useEffect(() => {
    let active = true;
    fetch("/api/daily/config", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (active && Array.isArray(data?.wheel)) setWheelRewards(data.wheel);
      })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-daily-modal", handler);
    return () => window.removeEventListener("open-daily-modal", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    try {
      const stored = localStorage.getItem("nf-daily");
      if (!stored) return;
      const data = JSON.parse(stored);
      if (data.date !== todayKey() || !data.token) {
        clearDailySession();
        return;
      }
      setToken(data.token);
      if (data.address) setAddress(data.address);
      fetch(`/api/daily/session?token=${encodeURIComponent(data.token)}`, { cache: "no-store" })
        .then((res) => res.json())
        .then(handleSessionResponse)
        .catch(() => {});
    } catch {}
  }, [clearDailySession, handleSessionResponse, open]);

  useEffect(() => {
    if (phase !== "payment" || !token || !open) return;

    const poll = async () => {
      try {
        await fetch("/api/daily/scan", { method: "POST" }).catch(() => {});
        const res = await fetch(`/api/daily/session?token=${encodeURIComponent(token)}`, { cache: "no-store" });
        const data = await res.json();
        handleSessionResponse(data);
      } catch {}
    };

    void poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [handleSessionResponse, open, phase, token]);

  useEffect(() => {
    if (!open || phase !== "payment" || !connectedAddress || loading || claimingFree) return;
    void claimDailyFree(connectedAddress);
  }, [claimDailyFree, claimingFree, connectedAddress, loading, open, phase]);

  useEffect(() => {
    if (isDemo || phase !== "payment" || !connectedAddress) return;
    let active = true;
    fetch(`/api/wallet/balance?address=${encodeURIComponent(connectedAddress)}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (active && typeof data.balanceCrc === "number") setWalletBalance(data.balanceCrc);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [connectedAddress, isDemo, phase]);

  const handleInit = useCallback(async () => {
    setLoading(true);
    setMiniAppError(null);
    setBalanceClaimError(null);
    try {
      const freeClaimAddress = connectedAddress || (isMiniApp ? walletAddress : null);
      if (freeClaimAddress && await claimDailyFree(freeClaimAddress)) return;

      const res = await fetch("/api/daily/init", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.token) throw new Error(data?.error || "Init failed");

      setToken(data.token);
      setPaymentLink(data.paymentLink || "");
      setQrCode(data.qrCode || "");
      saveDailySession(data.token, null);
      setPhase("payment");
    } catch {
      setPhase("init");
    } finally {
      setLoading(false);
    }
  }, [claimDailyFree, connectedAddress, isMiniApp, saveDailySession, walletAddress]);

  const handleReplayDaily = useCallback(async () => {
    setToken(null);
    setAddress(null);
    setPaymentLink("");
    setQrCode("");
    setWheelResult(null);
    setWheelSpinning(false);
    setPhase("init");
    clearDailySession();
    await handleInit();
  }, [clearDailySession, handleInit]);

  const handleWheel = useCallback(async () => {
    if (!token || wheelSpinning) return;
    setWheelResult(null);
    setWheelSpinning(true);
    try {
      const res = await fetch("/api/daily/wheel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok && data?.alreadyClaimed) {
        setWheelResult(data.result ?? null);
        setWheelSpinning(false);
        setPhase("complete");
        return;
      }
      if (!res.ok || !data?.result) throw new Error(data?.error || "Wheel failed");
      setWheelResult(data.result);
    } catch {
      setWheelSpinning(false);
    }
  }, [token, wheelSpinning]);

  const handleMiniAppPay = useCallback(async () => {
    if (!paymentLink) return;
    setMiniAppPaying(true);
    setMiniAppError(null);
    try {
      const match = paymentLink.match(/transfer\/(0x[a-fA-F0-9]+)\//);
      const recipient = match?.[1] || "";
      await sendPayment(recipient, 1, `daily:${token}`);
    } catch (err: any) {
      setMiniAppError(typeof err === "string" ? err : err?.message || tm.rejected[locale]);
    } finally {
      setMiniAppPaying(false);
    }
  }, [locale, paymentLink, sendPayment, tm, token]);

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
        setBalanceClaimError(data?.error === "no_balance" ? t.topUpBalanceFirst[locale] : t.failedTryAgain[locale]);
        return;
      }

      routeConfirmedSession({
        status: "confirmed",
        token: data.token,
        address: connectedAddress,
        wheelPlayed: data.session?.wheelPlayed,
        wheelResult: data.session?.wheelResult,
      });
    } catch (err: any) {
      setBalanceClaimError(err?.message || t.errorGeneric[locale]);
    } finally {
      setClaimingFromBalance(false);
    }
  }, [claimingFromBalance, connectedAddress, locale, routeConfirmedSession, t]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [paymentLink]);

  const handleDemo = useCallback(() => {
    const configuredWin = wheelRewards.find((entry) => entry.xpValue > 0 || entry.crcValue > 0);
    const result: DailyWheelResult = configuredWin ? {
      type: configuredWin.type,
      label: configuredWin.label,
      crcValue: configuredWin.crcValue,
      xpValue: configuredWin.xpValue,
      segmentIndex: Math.max(0, wheelRewards.indexOf(configuredWin)),
      color: configuredWin.color,
    } : {
      type: "xp_5",
      label: "+5 XP",
      crcValue: 0,
      xpValue: 5,
      segmentIndex: 1,
      color: "#10B981",
    };

    setToken("DEMO-DAILY");
    setAddress("0xdemo0000000000000000000000000000000dead");
    setWheelResult(result);
    setWheelSpinning(false);
    if (result.crcValue > 0) creditDemoBalance(result.crcValue);
    if (result.xpValue > 0) addXp("daily_wheel");
    setPhase("complete");
  }, [addXp, creditDemoBalance, wheelRewards]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-black text-white shadow-lg shadow-amber-500/20 transition hover:bg-amber-600"
      >
        <Sparkles className="h-4 w-4" />
        {t.payButton[locale]}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-ink/10 bg-paper p-5 shadow-2xl dark:bg-[#111114]">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-black uppercase tracking-wide text-ink">{t.title[locale]}</h2>
                <p className="mt-1 text-sm font-medium text-ink/60">{t.subtitle[locale]}</p>
              </div>
              <button
                type="button"
                onClick={close}
                className="rounded-lg p-2 text-ink/60 transition hover:bg-ink/10 hover:text-ink"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {phase === "init" && (
              <div className="space-y-4 text-center">
                {rewardPreview}
                <button
                  type="button"
                  onClick={isDemo ? handleDemo : handleInit}
                  disabled={loading || claimingFree}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-4 text-base font-black text-white shadow-lg shadow-amber-500/20 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {(loading || claimingFree) && <Loader2 className="h-5 w-5 animate-spin" />}
                  {t.claimFree[locale]}
                </button>
                {isDemo && (
                  <p className="text-xs font-bold text-ink/50">{t.testWithoutPaying[locale]}</p>
                )}
              </div>
            )}

            {phase === "payment" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-ink/10 bg-ink/[0.03] p-4 text-center">
                  <p className="text-sm font-black uppercase tracking-widest text-ink/60">{t.waitingPayment[locale]}</p>
                  <p className="mt-1 text-sm text-ink/60">{t.scanQr[locale]}</p>
                </div>

                {connectedAddress && (
                  <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-black uppercase tracking-widest text-emerald-700">
                          {locale === "fr" ? "Wallet connecte" : "Connected wallet"}
                        </p>
                        <p className="truncate text-sm font-bold text-ink/80">{connectedAddress}</p>
                        {walletBalance !== null && (
                          <p className="text-xs font-bold text-ink/50">
                            {stake.format(walletBalance)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={handleBalanceClaim}
                        disabled={claimingFromBalance}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {claimingFromBalance ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                        {locale === "fr" ? "Valider" : "Claim"}
                      </button>
                    </div>
                    {balanceClaimError && <p className="mt-2 text-xs font-bold text-red-500">{balanceClaimError}</p>}
                  </div>
                )}

                {qrCode && (
                  <div className="flex justify-center rounded-xl bg-white p-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrCode} alt="Daily payment QR code" className="h-56 w-56" />
                  </div>
                )}

                {isMiniApp && (
                  <button
                    type="button"
                    onClick={handleMiniAppPay}
                    disabled={miniAppPaying}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 font-black text-white transition hover:bg-violet-700 disabled:opacity-60"
                  >
                    {miniAppPaying && <Loader2 className="h-5 w-5 animate-spin" />}
                    {t.payWithCircles[locale]}
                  </button>
                )}
                {miniAppError && <p className="text-sm font-bold text-red-500">{miniAppError}</p>}

                {paymentLink && (
                  <button
                    type="button"
                    onClick={copyLink}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-ink/10 px-4 py-3 text-sm font-bold text-ink/70 transition hover:bg-ink/5"
                  >
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? t.copied[locale] : t.orCopy[locale]}
                  </button>
                )}
              </div>
            )}

            {phase === "wheel" && (
              <div className="space-y-5">
                {rewardPreview}
                <div className="text-center">
                  <h3 className="text-lg font-black text-ink">{t.spinTitle[locale]}</h3>
                  <p className="text-sm font-medium text-ink/60">
                    {locale === "fr" ? "Un seul tirage daily : solde XP jouable ou CRC selon la configuration." : "One daily draw: playable XP balance or CRC based on the configuration."}
                  </p>
                </div>
                <SpinWheel
                  result={wheelResult}
                  onSpin={handleWheel}
                  onComplete={() => {
                    setWheelSpinning(false);
                    setPhase("complete");
                  }}
                  spinning={wheelSpinning}
                  locale={locale}
                  segments={wheelSegments.length > 0 ? wheelSegments : undefined}
                />
              </div>
            )}

            {phase === "complete" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-ink/10 bg-ink/[0.03] p-4 text-center">
                  <p className="text-xs font-black uppercase tracking-widest text-ink/50">{t.summaryTitle[locale]}</p>
                  <p className="mt-2 text-2xl font-black text-ink">
                    {wheelResult ? arcadeLabel(wheelResult.label) : t.nothing[locale]}
                  </p>
                  {wheelResult?.crcValue ? (
                    <p className="mt-1 text-sm font-black text-emerald-600">+{stake.format(wheelResult.crcValue)}</p>
                  ) : null}
                  {wheelResult?.xpValue ? (
                    <p className="mt-1 text-sm font-black text-violet-600">+{wheelResult.xpValue} XP de solde</p>
                  ) : null}
                  {address && <p className="mt-3 truncate text-xs font-bold text-ink/40">{address}</p>}
                </div>

                <button
                  type="button"
                  onClick={handleReplayDaily}
                  disabled={loading || claimingFree}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-ink/10 px-4 py-3 text-sm font-black text-ink/70 transition hover:bg-ink/5 disabled:opacity-60"
                >
                  {(loading || claimingFree) && <Loader2 className="h-4 w-4 animate-spin" />}
                  {locale === "fr" ? "Relancer pour tester" : "Replay for testing"}
                </button>
              </div>
            )}

            {wheelRewards.length > 0 && (
              <div className="mt-5 border-t border-ink/10 pt-4">
                <button
                  type="button"
                  onClick={() => setShowProbs((value) => !value)}
                  className="flex w-full items-center justify-between text-xs font-black uppercase tracking-widest text-ink/50"
                >
                  {t.viewProbabilities[locale]}
                  <ChevronDown className={`h-4 w-4 transition ${showProbs ? "rotate-180" : ""}`} />
                </button>

                {showProbs && (
                  <div className="mt-3 space-y-2">
                    {wheelRewards.map((entry) => (
                      <div key={entry.type} className="flex items-center justify-between gap-3 rounded-lg bg-ink/[0.03] px-3 py-2 text-sm">
                        <span className="min-w-0 truncate font-bold text-ink/80">{rewardLabel(entry)}</span>
                        <span className="font-black text-ink/50">{rewardProb(entry)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
