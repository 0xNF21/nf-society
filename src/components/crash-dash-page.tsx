"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { ChancePayment } from "@/components/chance-payment";
import { PnlCard } from "@/components/pnl-card";
import { QuickReplayModal } from "@/components/quick-replay-modal";
import { usePlayerToken } from "@/hooks/use-player-token";
import { darkSafeColor } from "@/lib/utils";
import {
  generateCrashPoint, getMultiplierAtTick, getDangerLevel,
  getVitalityPct, applyAction, calculatePayout,
} from "@/lib/crash-dash";
import type { CrashDashVisibleState } from "@/lib/crash-dash";

type CrashDashTable = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  betOptions: number[];
  recipientAddress: string;
  primaryColor: string;
  accentColor: string;
  status: string;
};

type RoundResponse = CrashDashVisibleState & {
  id: number;
  tableId: number;
  playerAddress: string;
  outcome: string | null;
  payoutCrc: number | null;
  payoutStatus: string;
  createdAt: string;
};

// ── Plant SVG ──────────────────────────────────────────

function PlantSvg({ danger, wilted, scale }: { danger: "safe" | "warning" | "danger"; wilted: boolean; scale: number }) {
  const colors = wilted
    ? { stem: "#5a3a3a", leafL: "rgba(100,30,30,0.5)", leafR: "rgba(80,20,20,0.4)", flower: "#5a3a3a", glow: "none" }
    : danger === "danger"
    ? { stem: "#ef4444", leafL: "rgba(239,68,68,0.6)", leafR: "rgba(239,68,68,0.5)", flower: "#ef4444", glow: "drop-shadow(0 0 20px rgba(239,68,68,0.6))" }
    : danger === "warning"
    ? { stem: "#f59e0b", leafL: "rgba(245,158,11,0.6)", leafR: "rgba(245,158,11,0.5)", flower: "#f59e0b", glow: "drop-shadow(0 0 16px rgba(245,158,11,0.5))" }
    : { stem: "#22c55e", leafL: "rgba(34,197,94,0.6)", leafR: "rgba(34,197,94,0.5)", flower: "#22c55e", glow: "drop-shadow(0 0 12px rgba(34,197,94,0.4))" };

  const flowerScale = wilted ? 0.3 : Math.min(1 + (scale - 1) * 0.15, 2.2);
  const flowerY = wilted ? 50 : 28;
  const flowerRotate = wilted ? 45 : 0;

  return (
    <svg viewBox="0 0 120 180" xmlns="http://www.w3.org/2000/svg" className="w-28 h-40 transition-all duration-300" style={{ filter: wilted ? "grayscale(0.8) drop-shadow(0 0 8px rgba(239,68,68,0.2))" : colors.glow }}>
      {/* Root system */}
      <g opacity="0.3" stroke={colors.stem} strokeWidth="1" fill="none">
        <path d="M60 170 L45 180 M60 170 L75 180 M60 170 L30 185 M60 170 L90 185" />
      </g>
      {/* Stem */}
      <path d="M60 170 C60 150 58 130 60 100 C62 70 60 50 60 30" stroke={colors.stem} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Left leaf */}
      <path d="M58 110 C40 100 25 85 35 70 C45 80 55 95 58 110Z" fill={colors.leafL} stroke={colors.stem} strokeWidth="0.5" />
      {/* Right leaf */}
      <path d="M62 90 C80 80 95 65 85 50 C75 60 65 75 62 90Z" fill={colors.leafR} stroke={colors.stem} strokeWidth="0.5" />
      {/* Flower head */}
      <g transform={`translate(60, ${flowerY}) scale(${flowerScale}) rotate(${flowerRotate})`}>
        <circle cx="0" cy="0" r="8" fill={colors.flower} opacity="0.9" />
        <circle cx="-12" cy="0" r="5" fill={colors.leafL} />
        <circle cx="12" cy="0" r="5" fill={colors.leafL} />
        <circle cx="0" cy="-12" r="5" fill={colors.leafL} />
        <circle cx="0" cy="12" r="5" fill={colors.leafL} />
        <circle cx="-8" cy="-8" r="4" fill={colors.leafR} />
        <circle cx="8" cy="-8" r="4" fill={colors.leafR} />
        <circle cx="-8" cy="8" r="4" fill={colors.leafR} />
        <circle cx="8" cy="8" r="4" fill={colors.leafR} />
      </g>
    </svg>
  );
}

// ── Vitality Bar ──────────────────────────────────────

function VitalityBar({ pct, locale }: { pct: number; locale: "fr" | "en" }) {
  const t = translations.crashDash;
  const barColor = pct < 25 ? "bg-red-500" : pct < 55 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px] text-ink/40 uppercase tracking-widest">
        <span>{t.vitality[locale]}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-ink/5 dark:bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-100 ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── History Chips ──────────────────────────────────────

function HistoryChips({ history }: { history: Array<{ crashPoint: number; won: boolean }> }) {
  if (history.length === 0) return null;
  return (
    <div className="flex gap-1.5 flex-wrap mt-3">
      {history.map((h, i) => {
        const cls = h.crashPoint >= 5 ? "bg-red-50 text-red-500 border-red-200 dark:bg-red-900/20 dark:border-red-800"
          : h.crashPoint >= 2 ? "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800"
          : "bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800";
        return (
          <span key={i} className={`text-[10px] font-bold px-2 py-0.5 rounded border ${cls}`}>
            {h.crashPoint.toFixed(2)}x
          </span>
        );
      })}
    </div>
  );
}

// ── Crash Animation (the core real-time component) ────

function CrashAnimation({
  crashPoint,
  autoHarvest,
  onHarvest,
  onCrash,
  accentColor,
  locale,
}: {
  crashPoint: number;
  autoHarvest: number | null;
  onHarvest: (multiplier: number) => void;
  onCrash: (crashPoint: number) => void;
  accentColor: string;
  locale: "fr" | "en";
}) {
  const t = translations.crashDash;
  const [multiplier, setMultiplier] = useState(1.00);
  const [vitality, setVitality] = useState(100);
  const [status, setStatus] = useState<"growing" | "crashed" | "harvested">("growing");
  const startTimeRef = useRef(Date.now());
  const rafRef = useRef<number>(0);
  const finishedRef = useRef(false);

  useEffect(() => {
    startTimeRef.current = Date.now();
    finishedRef.current = false;

    const tick = () => {
      if (finishedRef.current) return;

      const elapsed = Date.now() - startTimeRef.current;
      const m = getMultiplierAtTick(elapsed);

      // Check auto-harvest
      if (autoHarvest && m >= autoHarvest && m <= crashPoint) {
        finishedRef.current = true;
        setMultiplier(autoHarvest);
        setStatus("harvested");
        onHarvest(autoHarvest);
        return;
      }

      // Check crash
      if (m >= crashPoint) {
        finishedRef.current = true;
        setMultiplier(crashPoint);
        setVitality(0);
        setStatus("crashed");
        onCrash(crashPoint);
        return;
      }

      setMultiplier(m);
      setVitality(getVitalityPct(m));
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [crashPoint, autoHarvest, onHarvest, onCrash]);

  const danger = getDangerLevel(multiplier);
  const isGrowing = status === "growing";

  const handleHarvest = () => {
    if (!isGrowing || finishedRef.current) return;
    finishedRef.current = true;
    cancelAnimationFrame(rafRef.current);
    setStatus("harvested");
    onHarvest(multiplier);
  };

  const multColor = status === "crashed" ? "text-red-500"
    : status === "harvested" ? "text-yellow-500"
    : danger === "danger" ? "text-red-500"
    : danger === "warning" ? "text-amber-500"
    : "text-emerald-500";

  return (
    <div className="space-y-4">
      {/* Plant + Multiplier */}
      <div className="relative flex items-center justify-center h-48">
        <PlantSvg danger={danger} wilted={status === "crashed"} scale={multiplier} />
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className={`text-5xl font-black tabular-nums transition-colors ${multColor}`}>
            {multiplier.toFixed(2)}x
          </p>
          <p className="text-[10px] text-ink/40 uppercase tracking-widest mt-1">
            {status === "crashed" ? t.crashed[locale] : status === "harvested" ? t.harvested[locale] : t.growing[locale]}
          </p>
        </div>
      </div>

      {/* Vitality bar */}
      <VitalityBar pct={vitality} locale={locale} />

      {/* Harvest button */}
      {isGrowing && (
        <button
          onClick={handleHarvest}
          className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 animate-pulse"
          style={{ backgroundColor: accentColor }}
        >
          {t.harvest[locale]} ({multiplier.toFixed(2)}x)
        </button>
      )}
    </div>
  );
}

// ── Result Panel ──────────────────────────────────────

function ResultPanel({
  won,
  betCrc,
  cashoutMultiplier,
  crashPoint,
  payoutCrc,
  accentColor,
  locale,
  playerName,
  playerAvatar,
  onPlayAgain,
}: {
  won: boolean;
  betCrc: number;
  cashoutMultiplier: number | null;
  crashPoint: number;
  payoutCrc: number;
  accentColor: string;
  locale: "fr" | "en";
  playerName?: string;
  playerAvatar?: string;
  onPlayAgain: () => void;
}) {
  const t = translations.crashDash;
  const profit = won ? payoutCrc - betCrc : -betCrc;

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-6 text-center ${
        won
          ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
          : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
      }`}>
        <p className="text-4xl mb-2">{won ? "🌿" : "🥀"}</p>
        <p className={`text-4xl font-black mb-2 ${won ? "text-emerald-600" : "text-red-500"}`}>
          {won ? `${cashoutMultiplier?.toFixed(2)}x` : `${crashPoint.toFixed(2)}x`}
        </p>
        <p className="font-bold text-lg text-ink">
          {won ? t.youWin[locale] : t.youLose[locale]}
        </p>
        <p className="text-sm text-ink/60 mt-1">
          {t.crashPoint[locale]}: {crashPoint.toFixed(2)}x
          {won && cashoutMultiplier && ` | ${t.harvest[locale]}: ${cashoutMultiplier.toFixed(2)}x`}
        </p>
        {won && payoutCrc > 0 && (
          <p className="text-lg text-emerald-600 font-bold mt-2">+{Math.round(profit * 1000) / 1000} CRC</p>
        )}
      </div>

      <button
        onClick={onPlayAgain}
        className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90 flex items-center justify-center gap-2"
        style={{ backgroundColor: accentColor }}
      >
        <RefreshCw className="w-4 h-4" />
        {t.playAgain[locale]}
      </button>

      <PnlCard
        gameType="crash_dash"
        result={won ? "win" : "loss"}
        betCrc={betCrc}
        gainCrc={Math.round(profit * 1000) / 1000}
        playerName={playerName || "Player"}
        playerAvatar={playerAvatar}
        stats={`Crash: ${crashPoint.toFixed(2)}x${won && cashoutMultiplier ? ` | Harvest: ${cashoutMultiplier.toFixed(2)}x` : ""}`}
        date={new Date().toLocaleDateString()}
        locale={locale}
      />
    </div>
  );
}

// ── Demo Game (client-only, no payment) ──────────────

function DemoCrashDashGame({ table }: { table: CrashDashTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.crashDash;

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 10);
  const [autoHarvest, setAutoHarvest] = useState<number | null>(null);
  const [autoHarvestInput, setAutoHarvestInput] = useState("");
  const [phase, setPhase] = useState<"bet" | "playing" | "result">("bet");
  const [crashPoint, setCrashPoint] = useState(1.00);
  const [result, setResult] = useState<{ won: boolean; cashoutMultiplier: number | null; crashPoint: number; payoutCrc: number } | null>(null);
  const [history, setHistory] = useState<Array<{ crashPoint: number; won: boolean }>>([]);
  const [demoBalance, setDemoBalance] = useState(1000);
  const [demoProfit, setDemoProfit] = useState(0);
  const [demoGames, setDemoGames] = useState(0);
  const [demoBest, setDemoBest] = useState<number | null>(null);
  const [showReplay, setShowReplay] = useState(false);

  const betOptions = table.betOptions as number[];
  const quickAuto = [1.5, 2, 5, 10];

  const startGame = useCallback((bet: number = selectedBet) => {
    if (bet > demoBalance) return;
    const cp = generateCrashPoint();
    setCrashPoint(cp);
    setDemoBalance(prev => prev - bet);
    setResult(null);
    setPhase("playing");
  }, [selectedBet, demoBalance]);

  const handleHarvest = useCallback((mult: number) => {
    const payout = Math.floor(selectedBet * mult * 100) / 100;
    const profit = payout - selectedBet;
    setDemoBalance(prev => prev + payout);
    setDemoProfit(prev => prev + profit);
    setDemoGames(prev => prev + 1);
    if (!demoBest || mult > demoBest) setDemoBest(mult);
    setHistory(prev => [{ crashPoint, won: true }, ...prev].slice(0, 12));
    setResult({ won: true, cashoutMultiplier: mult, crashPoint, payoutCrc: payout });
    setPhase("result");
  }, [selectedBet, crashPoint, demoBest]);

  const handleCrash = useCallback((cp: number) => {
    setDemoProfit(prev => prev - selectedBet);
    setDemoGames(prev => prev + 1);
    setHistory(prev => [{ crashPoint: cp, won: false }, ...prev].slice(0, 12));
    setResult({ won: false, cashoutMultiplier: null, crashPoint: cp, payoutCrc: 0 });
    setPhase("result");
  }, [selectedBet]);

  const resetGame = useCallback(() => {
    setResult(null);
    setPhase("bet");
  }, []);

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>
            🌱
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">
              {table.title} <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded ml-1">DEMO</span>
            </h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Bet phase */}
      {phase === "bet" && (
        <div className="space-y-4">
          {/* Bet selection */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-5 space-y-3">
            <h2 className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
            <div className="grid grid-cols-4 gap-2">
              {betOptions.map((bet) => (
                <button key={bet} onClick={() => setSelectedBet(bet)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                    selectedBet === bet ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                  }`}
                  style={selectedBet === bet ? { backgroundColor: accentColor } : {}}>
                  {bet}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-harvest */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-5 space-y-3">
            <h2 className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">{t.autoHarvest[locale]}</h2>
            <div className="grid grid-cols-5 gap-2">
              <button
                onClick={() => { setAutoHarvest(null); setAutoHarvestInput(""); }}
                className={`py-2 rounded-lg text-xs font-bold transition-all ${
                  autoHarvest === null ? "text-white" : "bg-ink/5 dark:bg-white/5 text-ink/40"
                }`}
                style={autoHarvest === null ? { backgroundColor: accentColor } : {}}
              >
                {t.manual[locale]}
              </button>
              {quickAuto.map((val) => (
                <button key={val} onClick={() => { setAutoHarvest(val); setAutoHarvestInput(String(val)); }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    autoHarvest === val ? "text-white" : "bg-ink/5 dark:bg-white/5 text-ink/40"
                  }`}
                  style={autoHarvest === val ? { backgroundColor: accentColor } : {}}>
                  {val}x
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1.01"
              step="0.01"
              placeholder={t.manual[locale]}
              value={autoHarvestInput}
              onChange={(e) => {
                setAutoHarvestInput(e.target.value);
                const v = parseFloat(e.target.value);
                setAutoHarvest(!isNaN(v) && v >= 1.01 ? v : null);
              }}
              className="w-full bg-ink/5 dark:bg-white/5 border border-ink/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-emerald-400 placeholder:text-ink/30"
            />
          </div>

          {/* Potential payout */}
          {autoHarvest && (
            <div className="text-center rounded-xl border border-ink/10 dark:border-white/10 py-3 bg-white/60 dark:bg-white/5">
              <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.potentialPayout[locale]}</p>
              <p className="text-lg font-bold text-emerald-600">{Math.floor(selectedBet * autoHarvest * 100) / 100} CRC</p>
            </div>
          )}

          {/* Plant button */}
          <button
            onClick={() => startGame()}
            disabled={selectedBet > demoBalance}
            className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 disabled:opacity-30"
            style={{ backgroundColor: accentColor }}
          >
            {t.plant[locale]} — {selectedBet} CRC
          </button>
        </div>
      )}

      {/* Playing phase */}
      {phase === "playing" && (
        <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-5">
          <CrashAnimation
            crashPoint={crashPoint}
            autoHarvest={autoHarvest}
            onHarvest={handleHarvest}
            onCrash={handleCrash}
            accentColor={accentColor}
            locale={locale}
          />
        </div>
      )}

      {/* Result phase */}
      {phase === "result" && result && (
        <ResultPanel
          won={result.won}
          betCrc={selectedBet}
          cashoutMultiplier={result.cashoutMultiplier}
          crashPoint={result.crashPoint}
          payoutCrc={result.payoutCrc}
          accentColor={accentColor}
          locale={locale}
          onPlayAgain={() => setShowReplay(true)}
        />
      )}

      {/* Quick replay modal (demo — uses local demoBalance) */}
      <QuickReplayModal
        open={showReplay}
        onClose={() => setShowReplay(false)}
        betOptions={betOptions}
        currentBet={selectedBet}
        onBetChange={setSelectedBet}
        accentColor={accentColor}
      >
        <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10 p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
              {translations.quickReplay.demoBalance[locale]}
            </div>
            <span className="text-emerald-700 dark:text-emerald-400 tabular-nums font-medium">
              {demoBalance.toFixed(2)} CRC
            </span>
          </div>
          <button
            onClick={() => {
              if (selectedBet > demoBalance) return;
              setShowReplay(false);
              startGame(selectedBet);
            }}
            disabled={selectedBet > demoBalance}
            className="w-full h-11 rounded-xl font-bold text-white transition-all disabled:opacity-40 hover:opacity-90"
            style={{ backgroundColor: accentColor }}
          >
            🧪 {translations.quickReplay.demoPay[locale].replace("{amount}", String(selectedBet))}
          </button>
          {selectedBet > demoBalance && (
            <p className="text-xs text-red-500 text-center font-semibold">
              {translations.quickReplay.demoInsufficient[locale]}
            </p>
          )}
        </div>
      </QuickReplayModal>

      {/* Stats bar */}
      <div className="mt-6 rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4">
        <div className="grid grid-cols-4 gap-3 text-center">
          <div>
            <p className="text-lg font-bold text-ink">{Math.round(demoBalance * 1000) / 1000}</p>
            <p className="text-[9px] text-ink/40 uppercase tracking-widest">{t.balance[locale]}</p>
          </div>
          <div>
            <p className={`text-lg font-bold ${demoProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {demoProfit >= 0 ? "+" : ""}{Math.round(demoProfit * 1000) / 1000}
            </p>
            <p className="text-[9px] text-ink/40 uppercase tracking-widest">{t.profit[locale]}</p>
          </div>
          <div>
            <p className="text-lg font-bold text-ink">{demoGames}</p>
            <p className="text-[9px] text-ink/40 uppercase tracking-widest">{t.games[locale]}</p>
          </div>
          <div>
            <p className="text-lg font-bold text-ink">{demoBest ? `${demoBest.toFixed(2)}x` : "—"}</p>
            <p className="text-[9px] text-ink/40 uppercase tracking-widest">{t.best[locale]}</p>
          </div>
        </div>

        <HistoryChips history={history} />

        <p className="text-[9px] text-ink/30 uppercase tracking-widest text-center mt-3">{t.provablyFair[locale]}</p>
      </div>
    </div>
  );
}

// ── Main export (switches demo / real) ──────────────────

export default function CrashDashPageClient({ table }: { table: CrashDashTable }) {
  const { isDemo } = useDemo();
  if (isDemo) return <DemoCrashDashGame table={table} />;
  return <RealCrashDashGame table={table} />;
}

// ── Real Game (with blockchain payment) ──────────────────

function RealCrashDashGame({ table }: { table: CrashDashTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.crashDash;
  const tokenRef = usePlayerToken("crash_dash", table.slug);

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 10);
  const [autoHarvest, setAutoHarvest] = useState<number | null>(null);
  const [autoHarvestInput, setAutoHarvestInput] = useState("");
  const [round, setRound] = useState<RoundResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [playerProfile, setPlayerProfile] = useState<{ name?: string; imageUrl?: string | null } | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [history, setHistory] = useState<Array<{ crashPoint: number; won: boolean }>>([]);
  const [showReplay, setShowReplay] = useState(false);

  const betOptions = table.betOptions as number[];
  const quickAuto = [1.5, 2, 5, 10];

  // Restore active round on mount — re-runs when token becomes available after SSR hydration
  const tokenValue = tokenRef.current;
  useEffect(() => {
    if (!tokenValue) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/crash-dash/active?tableSlug=${table.slug}&token=${tokenValue}`);
        const data = await res.json();
        if (data.round && active) {
          setRound(data.round);
        }
      } catch {}
      if (active) setRestoring(false);
    })();
    return () => { active = false; };
  }, [table.slug, tokenValue]);

  // Fetch player profile
  useEffect(() => {
    if (!round?.playerAddress || playerProfile) return;
    (async () => {
      try {
        const res = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: [round.playerAddress] }),
        });
        const data = await res.json();
        const profile = data.profiles?.[round.playerAddress.toLowerCase()];
        if (profile) setPlayerProfile(profile);
      } catch {}
    })();
  }, [round?.playerAddress, playerProfile]);

  // Scan for payment
  const scanForRound = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`/api/crash-dash-scan?tableSlug=${table.slug}`, { method: "POST" });
      const activeRes = await fetch(`/api/crash-dash/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
      const activeData = await activeRes.json();
      if (activeData.round) {
        setWatchingPayment(false);
        setRound(activeData.round);
      }
    } catch {}
    setScanning(false);
  }, [table.slug, tokenRef]);

  // Poll scan
  useEffect(() => {
    if (round || restoring) return;
    const ms = watchingPayment ? 5000 : 15000;
    const interval = setInterval(scanForRound, ms);
    return () => clearInterval(interval);
  }, [round, restoring, watchingPayment, scanForRound]);

  // Handle harvest (cashout) — send to API
  const handleHarvest = useCallback(async (mult: number) => {
    if (!round) return;
    try {
      const res = await fetch(`/api/crash-dash/${round.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cashout", multiplier: mult, playerToken: tokenRef.current }),
      });
      const data = await res.json();
      if (res.ok) {
        setRound(data);
        if (data.crashPoint) {
          setHistory(prev => [{ crashPoint: data.crashPoint, won: data.outcome === "win" }, ...prev].slice(0, 12));
        }
      }
    } catch (err) {
      console.error("[CrashDash] Harvest error:", err);
    }
  }, [round, tokenRef]);

  // Handle crash — inform server
  const handleCrash = useCallback(async (cp: number) => {
    if (!round) return;
    try {
      const res = await fetch(`/api/crash-dash/${round.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "crash", playerToken: tokenRef.current }),
      });
      const data = await res.json();
      if (res.ok) {
        setRound(data);
        if (data.crashPoint) {
          setHistory(prev => [{ crashPoint: data.crashPoint, won: false }, ...prev].slice(0, 12));
        }
      }
    } catch (err) {
      console.error("[CrashDash] Crash report error:", err);
    }
  }, [round, tokenRef]);

  const resetGame = useCallback(() => {
    setRound(null);
    setWatchingPayment(false);
    setPlayerProfile(null);
  }, []);

  if (restoring) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink/30" />
      </div>
    );
  }

  const isPlaying = round && round.status === "playing";
  const isFinished = round && round.status !== "playing";
  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>
            🌱
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{table.title}</h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Before payment — bet selection + payment */}
      {!round && (
        <div className="space-y-4">
          {/* Bet selection */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-5 space-y-3">
            <h2 className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
            <div className="grid grid-cols-4 gap-2">
              {betOptions.map((bet) => (
                <button key={bet} onClick={() => setSelectedBet(bet)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                    selectedBet === bet ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                  }`}
                  style={selectedBet === bet ? { backgroundColor: accentColor } : {}}>
                  {bet}
                </button>
              ))}
            </div>
          </div>

          {/* Auto-harvest */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-5 space-y-3">
            <h2 className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">{t.autoHarvest[locale]}</h2>
            <div className="grid grid-cols-5 gap-2">
              <button
                onClick={() => { setAutoHarvest(null); setAutoHarvestInput(""); }}
                className={`py-2 rounded-lg text-xs font-bold transition-all ${
                  autoHarvest === null ? "text-white" : "bg-ink/5 dark:bg-white/5 text-ink/40"
                }`}
                style={autoHarvest === null ? { backgroundColor: accentColor } : {}}
              >
                {t.manual[locale]}
              </button>
              {quickAuto.map((val) => (
                <button key={val} onClick={() => { setAutoHarvest(val); setAutoHarvestInput(String(val)); }}
                  className={`py-2 rounded-lg text-xs font-bold transition-all ${
                    autoHarvest === val ? "text-white" : "bg-ink/5 dark:bg-white/5 text-ink/40"
                  }`}
                  style={autoHarvest === val ? { backgroundColor: accentColor } : {}}>
                  {val}x
                </button>
              ))}
            </div>
            <input
              type="number"
              min="1.01"
              step="0.01"
              placeholder={t.manual[locale]}
              value={autoHarvestInput}
              onChange={(e) => {
                setAutoHarvestInput(e.target.value);
                const v = parseFloat(e.target.value);
                setAutoHarvest(!isNaN(v) && v >= 1.01 ? v : null);
              }}
              className="w-full bg-ink/5 dark:bg-white/5 border border-ink/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-ink outline-none focus:border-emerald-400 placeholder:text-ink/30"
            />
          </div>

          {/* Payment */}
          <ChancePayment
            recipientAddress={table.recipientAddress}
            amountCrc={selectedBet}
            gameType="crash_dash"
            gameId={table.slug}
            accentColor={accentColor}
            payLabel={`Demurrage Dash — ${selectedBet} CRC`}
            onPaymentInitiated={async () => {
              await scanForRound();
              setWatchingPayment(true);
            }}
            onScan={scanForRound}
            scanning={scanning}
            paymentStatus={watchingPayment ? "watching" : "idle"}
            playerToken={tokenRef.current}
          />
        </div>
      )}

      {/* Playing — crash animation */}
      {isPlaying && (
        <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-5">
          <CrashAnimation
            crashPoint={999} // Real crash point is hidden — server validates
            autoHarvest={autoHarvest}
            onHarvest={handleHarvest}
            onCrash={handleCrash}
            accentColor={accentColor}
            locale={locale}
          />
        </div>
      )}

      {/* After game — result */}
      {isFinished && round && (
        <ResultPanel
          won={round.outcome === "win"}
          betCrc={round.betCrc}
          cashoutMultiplier={round.cashoutMultiplier}
          crashPoint={round.crashPoint || 1}
          payoutCrc={round.payoutCrc || 0}
          accentColor={accentColor}
          locale={locale}
          playerName={playerProfile?.name || (round.playerAddress ? shortenAddress(round.playerAddress) : undefined)}
          playerAvatar={playerProfile?.imageUrl || undefined}
          onPlayAgain={() => setShowReplay(true)}
        />
      )}

      {/* Quick replay modal */}
      <QuickReplayModal
        open={showReplay}
        onClose={() => setShowReplay(false)}
        betOptions={betOptions}
        currentBet={selectedBet}
        onBetChange={setSelectedBet}
        accentColor={accentColor}
      >
        <ChancePayment
          recipientAddress={table.recipientAddress}
          amountCrc={selectedBet}
          gameType="crash_dash"
          gameId={table.slug}
          accentColor={accentColor}
          payLabel={`Demurrage Dash — ${selectedBet} CRC`}
          onPaymentInitiated={async () => {
            setShowReplay(false);
            resetGame();
            setWatchingPayment(true);
            await scanForRound();
          }}
          onScan={scanForRound}
          scanning={scanning}
          paymentStatus={watchingPayment ? "watching" : "idle"}
          playerToken={tokenRef.current}
        />
      </QuickReplayModal>

      {/* History */}
      {history.length > 0 && (
        <div className="mt-4 rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4">
          <h3 className="text-[10px] font-bold text-ink/40 uppercase tracking-widest mb-2">{t.history[locale]}</h3>
          <HistoryChips history={history} />
          <p className="text-[9px] text-ink/30 uppercase tracking-widest text-center mt-3">{t.provablyFair[locale]}</p>
        </div>
      )}
    </div>
  );
}
