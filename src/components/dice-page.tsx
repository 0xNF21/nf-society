"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Dices } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { ChancePayment } from "@/components/chance-payment";
import { PnlCard } from "@/components/pnl-card";
import { usePlayerToken } from "@/hooks/use-player-token";
import { darkSafeColor } from "@/lib/utils";
import {
  calculateMultiplier, calculateWinChance, generateResult,
  MIN_TARGET, MAX_TARGET,
} from "@/lib/dice";
import type { DiceDirection, VisibleState } from "@/lib/dice";

type DiceTable = {
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

type RoundResponse = VisibleState & {
  id: number;
  tableId: number;
  playerAddress: string;
  outcome: string | null;
  payoutCrc: number | null;
  payoutStatus: string;
  createdAt: string;
};

// ── Dice Slider & Controls ──────────────────────────────

function DiceControls({
  target,
  direction,
  betCrc,
  onTargetChange,
  onDirectionChange,
  onRoll,
  disabled,
  accentColor,
  locale,
}: {
  target: number;
  direction: DiceDirection;
  betCrc: number;
  onTargetChange: (v: number) => void;
  onDirectionChange: (d: DiceDirection) => void;
  onRoll: () => void;
  disabled: boolean;
  accentColor: string;
  locale: "fr" | "en";
}) {
  const t = translations.dice;
  const multiplier = calculateMultiplier(target, direction);
  const winChance = calculateWinChance(target, direction);
  const payout = Math.floor(betCrc * multiplier * 100) / 100;

  return (
    <div className="space-y-5">
      {/* Direction toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => onDirectionChange("under")}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
            direction === "under" ? "text-white shadow-lg" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
          }`}
          style={direction === "under" ? { backgroundColor: accentColor } : {}}
        >
          {t.rollUnder[locale]}
        </button>
        <button
          onClick={() => onDirectionChange("over")}
          className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all ${
            direction === "over" ? "text-white shadow-lg" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
          }`}
          style={direction === "over" ? { backgroundColor: accentColor } : {}}
        >
          {t.rollOver[locale]}
        </button>
      </div>

      {/* Target slider */}
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-ink/50">
          <span>{t.target[locale]}</span>
          <span className="font-bold text-ink text-base">{target.toFixed(2)}</span>
        </div>
        <div className="relative">
          <div className="absolute inset-0 h-2 top-1/2 -translate-y-1/2 rounded-full overflow-hidden">
            {direction === "over" ? (
              <>
                <div className="absolute inset-0 bg-red-200 dark:bg-red-900/40" />
                <div
                  className="absolute right-0 top-0 bottom-0 bg-emerald-300 dark:bg-emerald-700/60"
                  style={{ width: `${100 - target}%` }}
                />
              </>
            ) : (
              <>
                <div className="absolute inset-0 bg-red-200 dark:bg-red-900/40" />
                <div
                  className="absolute left-0 top-0 bottom-0 bg-emerald-300 dark:bg-emerald-700/60"
                  style={{ width: `${target}%` }}
                />
              </>
            )}
          </div>
          <input
            type="range"
            min={MIN_TARGET}
            max={MAX_TARGET}
            step={0.5}
            value={target}
            onChange={(e) => onTargetChange(parseFloat(e.target.value))}
            className="relative w-full h-2 bg-transparent appearance-none cursor-pointer z-10
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer
              [&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:shadow-lg
              [&::-moz-range-thumb]:cursor-pointer"
            style={{
              // @ts-expect-error -- inline var for thumb border
              "--tw-border-opacity": "1",
            }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center rounded-xl border border-ink/10 dark:border-white/10 py-3 bg-white/60 dark:bg-white/5">
          <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.multiplier[locale]}</p>
          <p className="text-lg font-bold" style={{ color: accentColor }}>x{multiplier.toFixed(4)}</p>
        </div>
        <div className="text-center rounded-xl border border-ink/10 dark:border-white/10 py-3 bg-white/60 dark:bg-white/5">
          <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.winChance[locale]}</p>
          <p className="text-lg font-bold text-ink">{winChance.toFixed(2)}%</p>
        </div>
        <div className="text-center rounded-xl border border-ink/10 dark:border-white/10 py-3 bg-white/60 dark:bg-white/5">
          <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.potentialPayout[locale]}</p>
          <p className="text-lg font-bold text-emerald-600">{payout.toFixed(2)}</p>
        </div>
      </div>

      {/* Roll button */}
      <button
        onClick={onRoll}
        disabled={disabled}
        className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2"
        style={{ backgroundColor: accentColor }}
      >
        <Dices className="w-5 h-5" />
        {disabled ? t.rolling[locale] : t.roll[locale]}
      </button>
    </div>
  );
}

// ── Dice Result Display ──────────────────────────────

function DiceResult({
  result,
  target,
  direction,
  won,
  accentColor,
}: {
  result: number;
  target: number;
  direction: DiceDirection;
  won: boolean;
  accentColor: string;
}) {
  // Show where result falls on the scale
  return (
    <div className="relative mb-4">
      {/* Result bar */}
      <div className="relative h-4 rounded-full overflow-hidden bg-ink/10 dark:bg-white/10">
        {/* Win zone */}
        {direction === "over" ? (
          <div
            className="absolute right-0 top-0 bottom-0 bg-emerald-300/50 dark:bg-emerald-700/30"
            style={{ width: `${100 - target}%` }}
          />
        ) : (
          <div
            className="absolute left-0 top-0 bottom-0 bg-emerald-300/50 dark:bg-emerald-700/30"
            style={{ width: `${target}%` }}
          />
        )}
        {/* Target line */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-ink/40 dark:bg-white/40"
          style={{ left: `${target}%` }}
        />
        {/* Result marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg transition-all"
          style={{ left: `${Math.min(Math.max(result, 1), 99)}%`, transform: "translate(-50%, -50%)", backgroundColor: won ? "#10B981" : "#EF4444" }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-ink/30 mt-1">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

// ── Result Panel ──────────────────────────────────────

function ResultPanel({
  round,
  accentColor,
  locale,
  playerName,
  playerAvatar,
  onPlayAgain,
}: {
  round: RoundResponse;
  accentColor: string;
  locale: "fr" | "en";
  playerName?: string;
  playerAvatar?: string;
  onPlayAgain: () => void;
}) {
  const t = translations.dice;
  const won = round.status === "won";
  const payout = round.payoutCrc || 0;
  const multiplier = round.multiplier || 0;

  return (
    <div className="space-y-4">
      {/* Result visualization */}
      {round.result !== null && round.target !== null && round.direction && (
        <DiceResult
          result={round.result}
          target={round.target}
          direction={round.direction}
          won={won}
          accentColor={accentColor}
        />
      )}

      {/* Result number */}
      <div className={`rounded-2xl p-6 text-center ${
        won
          ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
          : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
      }`}>
        <p className="text-4xl mb-2">{won ? "🎲" : "💀"}</p>
        <p className={`text-4xl font-black mb-2 ${won ? "text-emerald-600" : "text-red-500"}`}>
          {round.result?.toFixed(2)}
        </p>
        <p className="font-bold text-lg text-ink">
          {won ? t.youWin[locale] : t.youLose[locale]}
        </p>
        <p className="text-sm text-ink/60 mt-1">
          {t.target[locale]}: {round.target?.toFixed(2)} | {round.direction === "over" ? t.rollOver[locale] : t.rollUnder[locale]} | x{multiplier.toFixed(4)}
        </p>
        {won && payout > 0 && (
          <p className="text-lg text-emerald-600 font-bold mt-2">+{Math.round(payout * 1000) / 1000} CRC</p>
        )}
      </div>

      <PnlCard
        gameType="dice"
        result={won ? "win" : "loss"}
        betCrc={round.betCrc}
        gainCrc={won ? Math.round((payout - round.betCrc) * 1000) / 1000 : -round.betCrc}
        playerName={playerName || "Player"}
        playerAvatar={playerAvatar}
        stats={`${t.target[locale]}: ${round.target?.toFixed(2)} | x${multiplier.toFixed(2)}`}
        date={new Date().toLocaleDateString()}
        locale={locale}
      />

      <button
        onClick={onPlayAgain}
        className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90"
        style={{ backgroundColor: accentColor }}
      >
        {t.playAgain[locale]}
      </button>
    </div>
  );
}

// ── Rolling animation ──────────────────────────────────

function RollingAnimation({ accentColor }: { accentColor: string }) {
  const [displayNum, setDisplayNum] = useState(50);

  useEffect(() => {
    const interval = setInterval(() => {
      setDisplayNum(Math.floor(Math.random() * 10000) / 100);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center py-8">
      <p className="text-6xl font-black tabular-nums" style={{ color: accentColor }}>
        {displayNum.toFixed(2)}
      </p>
      <Loader2 className="w-6 h-6 animate-spin mx-auto mt-4 text-ink/30" />
    </div>
  );
}

// ── Demo Game (client-only, no payment) ──────────────

function DemoDiceGame({ table }: { table: DiceTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.dice;

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [target, setTarget] = useState(50.5);
  const [direction, setDirection] = useState<DiceDirection>("over");
  const [result, setResult] = useState<RoundResponse | null>(null);
  const [rolling, setRolling] = useState(false);

  const betOptions = table.betOptions as number[];

  const handleRoll = useCallback(() => {
    if (rolling) return;
    setRolling(true);

    // Simulate roll with delay for animation
    setTimeout(() => {
      const rollResult = generateResult();
      const multiplier = calculateMultiplier(target, direction);

      let won = false;
      if (direction === "over") {
        won = rollResult > target;
      } else {
        won = rollResult < target;
      }

      const payoutCrc = won ? Math.floor(selectedBet * multiplier * 100) / 100 : 0;

      setResult({
        status: won ? "won" : "lost",
        betCrc: selectedBet,
        target,
        direction,
        result: rollResult,
        multiplier,
        payoutCrc,
        id: 0,
        tableId: 0,
        playerAddress: "",
        outcome: won ? "win" : "loss",
        payoutStatus: won ? "success" : "none",
        createdAt: new Date().toISOString(),
      });
      setRolling(false);
    }, 1500);
  }, [rolling, target, direction, selectedBet]);

  const resetGame = useCallback(() => {
    setResult(null);
    setRolling(false);
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
            🎲
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">
              {table.title} <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">DEMO</span>
            </h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Bet + game — before result */}
      {!result && !rolling && (
        <div className="space-y-6">
          {/* Bet selection */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
            <div className="grid grid-cols-4 gap-3">
              {betOptions.map((bet) => (
                <button key={bet} onClick={() => setSelectedBet(bet)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all ${
                    selectedBet === bet ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                  }`}
                  style={selectedBet === bet ? { backgroundColor: accentColor } : {}}>
                  {bet} CRC
                </button>
              ))}
            </div>
          </div>

          {/* Game controls */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6">
            <DiceControls
              target={target}
              direction={direction}
              betCrc={selectedBet}
              onTargetChange={setTarget}
              onDirectionChange={setDirection}
              onRoll={handleRoll}
              disabled={false}
              accentColor={accentColor}
              locale={locale}
            />
          </div>
        </div>
      )}

      {/* Rolling animation */}
      {rolling && <RollingAnimation accentColor={accentColor} />}

      {/* Result */}
      {result && !rolling && (
        <ResultPanel
          round={result}
          accentColor={accentColor}
          locale={locale}
          onPlayAgain={resetGame}
        />
      )}
    </div>
  );
}

// ── Main export (switches demo / real) ──────────────────

export default function DicePageClient({ table }: { table: DiceTable }) {
  const { isDemo } = useDemo();
  if (isDemo) return <DemoDiceGame table={table} />;
  return <RealDiceGame table={table} />;
}

// ── Real Game (with blockchain payment) ──────────────────

function RealDiceGame({ table }: { table: DiceTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.dice;
  const tokenRef = usePlayerToken("dice", table.slug);

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [target, setTarget] = useState(50.5);
  const [direction, setDirection] = useState<DiceDirection>("over");
  const [round, setRound] = useState<RoundResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [playerProfile, setPlayerProfile] = useState<{ name?: string; imageUrl?: string | null } | null>(null);
  const [restoring, setRestoring] = useState(true);

  const betOptions = table.betOptions as number[];

  // Restore active round on mount — re-runs when token becomes available after SSR hydration
  const tokenValue = tokenRef.current;
  useEffect(() => {
    if (!tokenValue) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/dice/active?tableSlug=${table.slug}&token=${tokenValue}`);
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
      await fetch(`/api/dice-scan?tableSlug=${table.slug}`, { method: "POST" });

      // Fetch active round by token
      const activeRes = await fetch(`/api/dice/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
      const activeData = await activeRes.json();
      if (activeData.round) {
        setWatchingPayment(false);
        setRound(activeData.round);
      }
    } catch {}
    setScanning(false);
  }, [table.slug]);

  // Poll scan
  useEffect(() => {
    if (round || restoring) return;
    const ms = watchingPayment ? 5000 : 15000;
    const interval = setInterval(scanForRound, ms);
    return () => clearInterval(interval);
  }, [round, restoring, watchingPayment, scanForRound]);

  // Handle roll action
  const handleRoll = useCallback(async () => {
    if (!round || rolling) return;
    setRolling(true);

    // Show animation for a bit
    await new Promise((resolve) => setTimeout(resolve, 1500));

    try {
      const res = await fetch(`/api/dice/${round.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, direction, playerToken: tokenRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[Dice] Action error:", data.error);
        setRolling(false);
        return;
      }
      setRound(data);
    } catch (err) {
      console.error("[Dice] Action fetch error:", err);
    }
    setRolling(false);
  }, [round, rolling, target, direction]);

  const resetGame = useCallback(() => {
    setRound(null);
    setWatchingPayment(false);
    setPlayerProfile(null);
    setRolling(false);
  }, []);

  // Loading
  if (restoring) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink/30" />
      </div>
    );
  }

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
            🎲
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{table.title}</h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Before payment — bet selection + payment */}
      {!round && (
        <div className="space-y-6">
          {/* Bet selection */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
            <div className="grid grid-cols-4 gap-3">
              {betOptions.map((bet) => (
                <button key={bet} onClick={() => setSelectedBet(bet)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all ${
                    selectedBet === bet ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                  }`}
                  style={selectedBet === bet ? { backgroundColor: accentColor } : {}}>
                  {bet} CRC
                </button>
              ))}
            </div>
          </div>

          {/* Payment */}
          <ChancePayment
            recipientAddress={table.recipientAddress}
            amountCrc={selectedBet}
            gameType="dice"
            gameId={table.slug}
            accentColor={accentColor}
            payLabel={`Dice — ${selectedBet} CRC`}
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

      {/* During game — controls + roll */}
      {round && !isFinished && !rolling && (
        <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6">
          <p className="text-xs text-ink/40 text-center mb-4">{t.setTarget[locale]}</p>
          <DiceControls
            target={target}
            direction={direction}
            betCrc={round.betCrc}
            onTargetChange={setTarget}
            onDirectionChange={setDirection}
            onRoll={handleRoll}
            disabled={false}
            accentColor={accentColor}
            locale={locale}
          />
        </div>
      )}

      {/* Rolling animation */}
      {rolling && <RollingAnimation accentColor={accentColor} />}

      {/* After game — result */}
      {round && isFinished && !rolling && (
        <ResultPanel
          round={round}
          accentColor={accentColor}
          locale={locale}
          playerName={playerProfile?.name || (round.playerAddress ? shortenAddress(round.playerAddress) : undefined)}
          playerAvatar={playerProfile?.imageUrl || undefined}
          onPlayAgain={resetGame}
        />
      )}
    </div>
  );
}
