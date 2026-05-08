"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, LogIn, Sparkles, X } from "lucide-react";
import { useAuthSession } from "@/components/auth-provider";
import { useDemo } from "@/components/demo-provider";
import { useLocale } from "@/components/language-provider";
import SpinWheel from "@/components/spin-wheel";
import { useStakeLabel } from "@/hooks/use-stake-label";
import type { DailyWheelResult, SpinSegment } from "@/lib/daily-shared";
import { translations } from "@/lib/i18n";

type Phase = "init" | "wheel" | "complete";

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
  wheelPlayed?: boolean;
  wheelResult?: DailyWheelResult | null;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

export default function DailyModal() {
  const { locale } = useLocale();
  const { isDemo, addXp, creditDemoBalance } = useDemo();
  const {
    isAuthenticated,
    address: connectedAddress,
    loading: authLoading,
    openLogin,
  } = useAuthSession();
  const t = translations.daily;
  const stake = useStakeLabel();

  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("init");
  const [token, setToken] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [wheelResult, setWheelResult] = useState<DailyWheelResult | null>(null);
  const [wheelSpinning, setWheelSpinning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showProbs, setShowProbs] = useState(false);
  const [wheelRewards, setWheelRewards] = useState<DailyRewardEntry[]>([]);
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
      clearDailySession();
      setToken(null);
      setPhase("init");
      return;
    }

    if (session.status === "expired" || session.status === "not_found") {
      clearDailySession();
      setToken(null);
      setPhase("init");
    }
  }, [clearDailySession, routeConfirmedSession]);

  const claimDailyFree = useCallback(async () => {
    if (!connectedAddress || claimingFree) return false;
    setClaimingFree(true);
    try {
      const res = await fetch("/api/daily/claim", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (res.status === 401) {
        openLogin();
        return false;
      }
      const data = await res.json();
      if (!res.ok || !data?.token) return false;

      routeConfirmedSession({
        status: "confirmed",
        token: data.token,
        address: data.address || connectedAddress.toLowerCase(),
        wheelPlayed: data.wheelPlayed,
        wheelResult: data.wheelResult,
      });
      return true;
    } catch {
      return false;
    } finally {
      setClaimingFree(false);
    }
  }, [claimingFree, connectedAddress, openLogin, routeConfirmedSession]);

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

  const handleInit = useCallback(async () => {
    if (authLoading) return;
    if (!isAuthenticated || !connectedAddress) {
      openLogin();
      return;
    }

    setLoading(true);
    try {
      await claimDailyFree();
    } catch {
      setPhase("init");
    } finally {
      setLoading(false);
    }
  }, [authLoading, claimDailyFree, connectedAddress, isAuthenticated, openLogin]);

  const handleReplayDaily = useCallback(async () => {
    setToken(null);
    setAddress(null);
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
  const needsAuth = !isDemo && !authLoading && !isAuthenticated;

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
                {needsAuth && (
                  <div className="rounded-xl border border-violet-500/20 bg-violet-500/10 p-4 text-left">
                    <p className="text-sm font-black text-ink dark:text-white">
                      {locale === "fr" ? "Connexion requise" : "Sign in required"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-ink/60 dark:text-white/60">
                      {locale === "fr"
                        ? "Le daily est gratuit, mais il doit etre lie a ton wallet connecte."
                        : "The daily is free, but it must be tied to your signed-in wallet."}
                    </p>
                  </div>
                )}
                <button
                  type="button"
                  onClick={isDemo ? handleDemo : handleInit}
                  disabled={authLoading || loading || claimingFree}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-4 text-base font-black text-white shadow-lg shadow-amber-500/20 transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {(authLoading || loading || claimingFree) && <Loader2 className="h-5 w-5 animate-spin" />}
                  {needsAuth && !authLoading && <LogIn className="h-5 w-5" />}
                  {needsAuth ? (locale === "fr" ? "Se connecter pour jouer" : "Sign in to play") : t.claimFree[locale]}
                </button>
                {isDemo && (
                  <p className="text-xs font-bold text-ink/50">{t.testWithoutPaying[locale]}</p>
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
