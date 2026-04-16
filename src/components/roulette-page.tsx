"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RotateCcw, X } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { ChancePayment } from "@/components/chance-payment";
import { PnlCard } from "@/components/pnl-card";
import { usePlayerToken } from "@/hooks/use-player-token";
import { darkSafeColor } from "@/lib/utils";
import {
  RED_NUMBERS, BLACK_NUMBERS, WHEEL_ORDER, BET_PAYOUTS,
  getNumberColor, generateResult, isBetWinning,
} from "@/lib/roulette";
import type { RouletteBet, BetType, VisibleState } from "@/lib/roulette";

type RouletteTable = {
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

// ── Constants ──────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  red: "#DC2626",
  black: "#1a1a2e",
  green: "#16A34A",
};

const TABLE_ROWS: number[][] = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

// ── Bet indicator — glowing bar + amount ──────────────────

function BetBadge({ amount }: { amount: number }) {
  return (
    <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 z-10 flex items-center gap-0.5">
      <span className="bg-yellow-400 text-[10px] font-black text-amber-900 px-1.5 py-px rounded-full shadow-md shadow-yellow-400/40 leading-tight">
        {amount}
      </span>
    </div>
  );
}

function ZoneBadge({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-center gap-1 bg-yellow-400 text-xs font-black text-amber-900 px-2 py-0.5 rounded-full shadow-md shadow-yellow-400/40 ml-1.5">
      {amount} CRC
    </span>
  );
}

// ── Roulette Wheel ──────────────────────────────────────

function RouletteWheel({
  spinning,
  resultNumber,
  onSpinEnd,
}: {
  spinning: boolean;
  resultNumber: number | null;
  onSpinEnd?: () => void;
}) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (!spinning || resultNumber === null) return;
    setShowResult(false);

    // Find position of result on the wheel
    const idx = WHEEL_ORDER.indexOf(resultNumber);
    const slotAngle = 360 / 37;
    // Target angle: result at top (marker position) — spin clockwise
    const targetOffset = idx * slotAngle + slotAngle / 2;
    // Multiple full spins + landing
    const totalSpin = 360 * 6 + (360 - targetOffset);
    setRotation((prev) => prev + totalSpin);

    const timer = setTimeout(() => {
      setShowResult(true);
      onSpinEnd?.();
    }, 4000);
    return () => clearTimeout(timer);
  }, [spinning, resultNumber]);

  const segments = WHEEL_ORDER.map((num, i) => {
    const color = getNumberColor(num);
    const angle = (360 / 37) * i;
    return { num, color, angle };
  });

  return (
    <div className="relative mx-auto" style={{ width: 260, height: 260 }}>
      {/* Marker (top) */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-20">
        <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-t-[16px] border-l-transparent border-r-transparent border-t-yellow-400 drop-shadow-md" />
      </div>

      {/* Wheel */}
      <div
        ref={wheelRef}
        className="w-full h-full rounded-full border-4 border-amber-700 shadow-2xl overflow-hidden relative"
        style={{
          transform: `rotate(${rotation}deg)`,
          transition: spinning ? "transform 4s cubic-bezier(0.15, 0.6, 0.25, 1)" : "none",
          background: "#1a1a2e",
        }}
      >
        {/* Segments */}
        {segments.map(({ num, color, angle }) => {
          const slotAngle = 360 / 37;
          const midAngle = angle + slotAngle / 2;
          const radAngle = (midAngle * Math.PI) / 180;
          const labelR = 108;
          const labelX = 130 + labelR * Math.sin(radAngle);
          const labelY = 130 - labelR * Math.cos(radAngle);
          const segR = 90;
          const segX = 130 + segR * Math.sin(radAngle);
          const segY = 130 - segR * Math.cos(radAngle);

          return (
            <div key={num}>
              {/* Color segment */}
              <div
                className="absolute rounded-sm"
                style={{
                  width: 18,
                  height: 30,
                  backgroundColor: COLOR_HEX[color],
                  left: segX - 9,
                  top: segY - 15,
                  transform: `rotate(${midAngle}deg)`,
                }}
              />
              {/* Number */}
              <span
                className="absolute text-[8px] font-bold text-white"
                style={{
                  left: labelX,
                  top: labelY,
                  transform: `translate(-50%, -50%) rotate(${midAngle}deg)`,
                }}
              >
                {num}
              </span>
            </div>
          );
        })}
        {/* Center circle */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-800 to-amber-950 border-2 border-amber-600 shadow-inner" />
        </div>
      </div>

      {/* Ball (visible after spin) */}
      {showResult && resultNumber !== null && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div
            className="absolute w-4 h-4 rounded-full bg-white shadow-lg border border-gray-300 animate-pulse"
            style={{
              top: 18,
              left: "50%",
              transform: "translateX(-50%)",
            }}
          />
        </div>
      )}

      {/* Result overlay */}
      {showResult && resultNumber !== null && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-2xl border-2 border-white/50"
            style={{ backgroundColor: COLOR_HEX[getNumberColor(resultNumber)] }}
          >
            {resultNumber}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Betting Table ──────────────────────────────────────

function BettingTable({
  bets,
  onAddBet,
  onClear,
  disabled,
  remaining,
  betCrc,
  locale,
}: {
  bets: RouletteBet[];
  onAddBet: (bet: Omit<RouletteBet, "amount">) => void;
  onClear: () => void;
  disabled: boolean;
  remaining: number;
  betCrc: number;
  locale: "fr" | "en";
}) {
  const t = translations.roulette;

  const chipCount = (type: BetType, number?: number): number => {
    return bets
      .filter((b) => b.type === type && (type !== "straight" || b.number === number))
      .reduce((s, b) => s + b.amount, 0);
  };

  const canBet = !disabled && remaining > 0;
  const totalPlaced = betCrc - remaining;

  // Build bet label for recap
  const betLabel = (b: RouletteBet, loc: "fr" | "en"): string => {
    if (b.type === "straight") return `#${b.number}`;
    const labels: Record<string, Record<"fr" | "en", string>> = {
      red: { fr: "Rouge", en: "Red" }, black: { fr: "Noir", en: "Black" },
      odd: { fr: "Impair", en: "Odd" }, even: { fr: "Pair", en: "Even" },
      low: { fr: "1-18", en: "1-18" }, high: { fr: "19-36", en: "19-36" },
      dozen1: { fr: "1-12", en: "1-12" }, dozen2: { fr: "13-24", en: "13-24" },
      dozen3: { fr: "25-36", en: "25-36" },
      col1: { fr: "Col.1", en: "Col.1" }, col2: { fr: "Col.2", en: "Col.2" }, col3: { fr: "Col.3", en: "Col.3" },
    };
    return labels[b.type]?.[loc] || b.type;
  };

  return (
    <div className="space-y-4">
      {/* ── Live bet recap ── */}
      <div className="rounded-xl bg-white/10 p-3 space-y-2">
        {/* Progress bar */}
        <div className="flex items-center justify-between text-xs text-white/70 mb-1">
          <span className="font-bold">{totalPlaced} / {betCrc} CRC</span>
          <button
            onClick={onClear}
            disabled={bets.length === 0}
            className="text-red-400 hover:text-red-300 disabled:opacity-30 flex items-center gap-1 font-bold"
          >
            <X className="w-3 h-3" /> {t.clear[locale]}
          </button>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${betCrc > 0 ? (totalPlaced / betCrc) * 100 : 0}%`,
              backgroundColor: remaining === 0 ? "#10B981" : "#FBBF24",
            }}
          />
        </div>

        {/* Bet list */}
        {bets.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {bets.map((b, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] font-bold bg-white/10 text-white/90 px-2 py-1 rounded-lg">
                <span className="text-yellow-400">{b.amount}</span>
                {betLabel(b, locale)}
                <span className="text-white/30">x{BET_PAYOUTS[b.type]}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-white/30 text-center mt-1">
            {t.placeBets[locale]}
          </p>
        )}
      </div>

      {/* ── Number grid ── */}
      <div className="space-y-1.5">
        {/* Zero */}
        <button
          onClick={() => canBet && onAddBet({ type: "straight", number: 0 })}
          disabled={!canBet}
          className={`relative w-full h-12 rounded-xl text-sm font-bold text-white transition-all ${
            chipCount("straight", 0) > 0 ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-[#0d4f2b]" : ""
          } ${canBet ? "hover:brightness-110 active:scale-[0.98]" : "opacity-60"}`}
          style={{ backgroundColor: COLOR_HEX.green }}
        >
          0
          {chipCount("straight", 0) > 0 && <BetBadge amount={chipCount("straight", 0)} />}
        </button>

        {/* 3x12 grid + columns */}
        {TABLE_ROWS.map((row, ri) => (
          <div key={ri} className="flex gap-1">
            <div className="flex-1 grid grid-cols-12 gap-0.5">
              {row.map((num) => {
                const color = getNumberColor(num);
                const chips = chipCount("straight", num);
                return (
                  <button
                    key={num}
                    onClick={() => canBet && onAddBet({ type: "straight", number: num })}
                    disabled={!canBet}
                    className={`relative h-12 rounded-lg text-xs font-bold text-white transition-all ${
                      chips > 0 ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-[#0d4f2b]" : ""
                    } ${canBet ? "hover:brightness-125 active:scale-90" : "opacity-60"}`}
                    style={{ backgroundColor: COLOR_HEX[color] }}
                  >
                    {num}
                    {chips > 0 && <BetBadge amount={chips} />}
                  </button>
                );
              })}
            </div>
            {/* Column 2:1 */}
            {(() => {
              const colType = `col${3 - ri}` as BetType;
              const chips = chipCount(colType);
              return (
                <button
                  onClick={() => canBet && onAddBet({ type: colType })}
                  disabled={!canBet}
                  className={`relative w-10 h-12 rounded-lg text-[10px] font-bold text-white/70 bg-white/10 transition-all ${
                    chips > 0 ? "ring-2 ring-yellow-400 text-white" : ""
                  } ${canBet ? "hover:bg-white/20 active:scale-90" : "opacity-60"}`}
                >
                  2:1
                  {chips > 0 && <BetBadge amount={chips} />}
                </button>
              );
            })()}
          </div>
        ))}
      </div>

      {/* ── Zone bets ── */}
      <div className="space-y-2">
        {/* Dozens */}
        <div className="grid grid-cols-3 gap-1.5">
          {([["dozen1", t.dz1[locale]], ["dozen2", t.dz2[locale]], ["dozen3", t.dz3[locale]]] as const).map(([type, label]) => {
            const chips = chipCount(type as BetType);
            return (
              <button
                key={type}
                onClick={() => canBet && onAddBet({ type: type as BetType })}
                disabled={!canBet}
                className={`h-11 rounded-xl text-xs font-bold text-white/80 bg-white/10 transition-all flex items-center justify-center gap-1 ${
                  chips > 0 ? "ring-2 ring-yellow-400 text-white bg-white/15" : ""
                } ${canBet ? "hover:bg-white/20 active:scale-95" : "opacity-60"}`}
              >
                {label} <span className="text-[9px] text-white/40">x3</span>
                {chips > 0 && <ZoneBadge amount={chips} />}
              </button>
            );
          })}
        </div>

        {/* Outside bets */}
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ["low", t.low[locale], undefined],
            ["even", t.even[locale], undefined],
            ["red", t.red[locale], COLOR_HEX.red],
            ["black", t.black[locale], COLOR_HEX.black],
            ["odd", t.odd[locale], undefined],
            ["high", t.high[locale], undefined],
          ] as const).map(([type, label, bg]) => {
            const chips = chipCount(type as BetType);
            return (
              <button
                key={type}
                onClick={() => canBet && onAddBet({ type: type as BetType })}
                disabled={!canBet}
                className={`h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  bg ? "text-white" : "text-white/80 bg-white/10"
                } ${chips > 0 ? "ring-2 ring-yellow-400 brightness-110" : ""
                } ${canBet ? "hover:brightness-110 active:scale-95" : "opacity-60"}`}
                style={bg ? { backgroundColor: bg } : undefined}
              >
                {label} <span className="text-[9px] opacity-50">x2</span>
                {chips > 0 && <ZoneBadge amount={chips} />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Result Panel ──────────────────────────────────────

function ResultPanel({
  round,
  locale,
  accentColor,
  playerName,
  playerAvatar,
  onPlayAgain,
}: {
  round: RoundResponse;
  locale: "fr" | "en";
  accentColor: string;
  playerName?: string;
  playerAvatar?: string;
  onPlayAgain: () => void;
}) {
  const t = translations.roulette;
  const won = round.status === "won";
  const payout = round.payoutCrc || 0;
  const resultNum = round.result ?? 0;
  const resultColor = getNumberColor(resultNum);

  // Show winning bets summary
  const winningBets = (round.bets as RouletteBet[] || []).filter((b) => isBetWinning(b, resultNum));

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-6 text-center ${
        won
          ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
          : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
      }`}>
        <div
          className="inline-flex items-center justify-center w-20 h-20 rounded-full text-white text-3xl font-black shadow-lg mx-auto mb-3"
          style={{ backgroundColor: COLOR_HEX[resultColor] }}
        >
          {resultNum}
        </div>
        <p className="font-bold text-lg text-ink">{won ? t.youWin[locale] : t.youLose[locale]}</p>
        {won && winningBets.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {winningBets.map((b, i) => (
              <p key={i} className="text-sm text-ink/60">
                {b.type === "straight" ? `#${b.number}` : t[b.type as keyof typeof t]?.[locale] || b.type}
                {" "}&mdash; {b.amount} CRC &times; {BET_PAYOUTS[b.type]}
              </p>
            ))}
          </div>
        )}
        {won && payout > 0 && (
          <p className="text-xl text-emerald-600 font-black mt-3">+{Math.round(payout * 1000) / 1000} CRC</p>
        )}
      </div>

      <PnlCard
        gameType="roulette"
        result={won ? "win" : "loss"}
        betCrc={round.betCrc}
        gainCrc={won ? Math.round((payout - round.betCrc) * 1000) / 1000 : -round.betCrc}
        playerName={playerName || "Player"}
        playerAvatar={playerAvatar}
        stats={`#${resultNum} ${resultColor}`}
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

// ── Shared game UI (used by both Demo and Real) ──────────

function GameUI({
  bets,
  setBets,
  betCrc,
  accentColor,
  locale,
  onSpin,
  spinning,
  resultNumber,
  isDemo,
}: {
  bets: RouletteBet[];
  setBets: (b: RouletteBet[]) => void;
  betCrc: number;
  accentColor: string;
  locale: "fr" | "en";
  onSpin: () => void;
  spinning: boolean;
  resultNumber: number | null;
  isDemo?: boolean;
}) {
  const t = translations.roulette;
  const totalPlaced = bets.reduce((s, b) => s + b.amount, 0);
  const remaining = betCrc - totalPlaced;
  const [wheelDone, setWheelDone] = useState(false);

  useEffect(() => { if (!spinning) setWheelDone(false); }, [spinning]);

  const addBet = useCallback((bet: Omit<RouletteBet, "amount">) => {
    if (remaining <= 0) return;
    // Merge with existing same-type bet
    const existing = bets.findIndex(
      (b) => b.type === bet.type && (bet.type !== "straight" || b.number === bet.number)
    );
    if (existing >= 0) {
      const updated = [...bets];
      updated[existing] = { ...updated[existing], amount: updated[existing].amount + 1 };
      setBets(updated);
    } else {
      setBets([...bets, { ...bet, amount: 1 } as RouletteBet]);
    }
  }, [bets, remaining, setBets]);

  return (
    <div className="space-y-4">
      {/* Wheel — always visible */}
      <div className="py-2">
        <RouletteWheel
          spinning={spinning}
          resultNumber={resultNumber}
          onSpinEnd={() => setWheelDone(true)}
        />
        {spinning && (
          <p className="text-center text-sm text-ink/40 mt-3 animate-pulse">{t.spinning[locale]}</p>
        )}
      </div>

      {/* Table — interactive before spin, dimmed during spin */}
      <div className={`rounded-2xl bg-[#0d4f2b] dark:bg-[#0a3d22] p-4 shadow-xl transition-opacity ${spinning ? "opacity-40 pointer-events-none" : ""}`}>
        <BettingTable
          bets={bets}
          onAddBet={addBet}
          onClear={() => setBets([])}
          disabled={spinning}
          remaining={remaining}
          betCrc={betCrc}
          locale={locale}
        />
      </div>

      {/* Spin button */}
      <button
        onClick={onSpin}
        disabled={totalPlaced === 0 || totalPlaced > betCrc || spinning}
        className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2"
        style={{ backgroundColor: accentColor }}
      >
        <RotateCcw className="w-5 h-5" />
        {spinning ? t.spinning[locale] : t.spin[locale]}
      </button>
    </div>
  );
}

// ── Demo Game ──────────────────────────────────────────

function DemoRouletteGame({ table }: { table: RouletteTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.roulette;

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [bets, setBets] = useState<RouletteBet[]>([]);
  const [result, setResult] = useState<RoundResponse | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [resultNumber, setResultNumber] = useState<number | null>(null);

  const betOptions = table.betOptions as number[];

  const handleSpin = useCallback(() => {
    if (spinning) return;
    const total = bets.reduce((s, b) => s + b.amount, 0);
    if (total === 0 || total > selectedBet) return;

    const num = generateResult();
    setResultNumber(num);
    setSpinning(true);

    // Wait for wheel animation
    setTimeout(() => {
      let payoutCrc = 0;
      for (const bet of bets) {
        if (isBetWinning(bet, num)) {
          payoutCrc += Math.floor(bet.amount * BET_PAYOUTS[bet.type] * 100) / 100;
        }
      }
      payoutCrc = Math.floor(payoutCrc * 100) / 100;

      setResult({
        status: payoutCrc > 0 ? "won" : "lost",
        betCrc: selectedBet,
        bets,
        result: num,
        payoutCrc,
        id: 0, tableId: 0, playerAddress: "",
        outcome: payoutCrc > 0 ? "win" : "loss",
        payoutStatus: payoutCrc > 0 ? "success" : "none",
        createdAt: new Date().toISOString(),
      });
      setSpinning(false);
    }, 4200);
  }, [spinning, bets, selectedBet]);

  const resetGame = useCallback(() => {
    setResult(null);
    setBets([]);
    setSpinning(false);
    setResultNumber(null);
  }, []);

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>🎰</div>
          <div>
            <h1 className="text-xl font-bold text-ink">
              {table.title} <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">DEMO</span>
            </h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {!result && (
        <>
          {/* Bet amount selection */}
          {!spinning && (
            <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4 mb-4">
              <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest mb-3">{t.chooseBet[locale]}</h2>
              <div className="grid grid-cols-4 gap-2">
                {betOptions.map((bet) => (
                  <button key={bet} onClick={() => { setSelectedBet(bet); setBets([]); }}
                    className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                      selectedBet === bet ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                    }`}
                    style={selectedBet === bet ? { backgroundColor: accentColor } : {}}>
                    {bet} CRC
                  </button>
                ))}
              </div>
            </div>
          )}

          <GameUI
            bets={bets}
            setBets={setBets}
            betCrc={selectedBet}
            accentColor={accentColor}
            locale={locale}
            onSpin={handleSpin}
            spinning={spinning}
            resultNumber={resultNumber}
            isDemo
          />
        </>
      )}

      {result && !spinning && (
        <ResultPanel round={result} locale={locale} accentColor={accentColor} onPlayAgain={resetGame} />
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────────

export default function RoulettePageClient({ table }: { table: RouletteTable }) {
  const { isDemo } = useDemo();
  if (isDemo) return <DemoRouletteGame table={table} />;
  return <RealRouletteGame table={table} />;
}

// ── Real Game ──────────────────────────────────────────

function RealRouletteGame({ table }: { table: RouletteTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.roulette;
  const tokenRef = usePlayerToken("roulette", table.slug);

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [bets, setBets] = useState<RouletteBet[]>([]);
  const [round, setRound] = useState<RoundResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [resultNumber, setResultNumber] = useState<number | null>(null);
  const [playerProfile, setPlayerProfile] = useState<{ name?: string; imageUrl?: string | null } | null>(null);
  const [restoring, setRestoring] = useState(true);

  const betOptions = table.betOptions as number[];

  // Restore active round
  useEffect(() => {
    if (!tokenRef.current) { setRestoring(false); return; }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/roulette/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
        const data = await res.json();
        if (data.round && active) setRound(data.round);
      } catch {}
      if (active) setRestoring(false);
    })();
    return () => { active = false; };
  }, [table.slug]);

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

  const scanForRound = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`/api/roulette-scan?tableSlug=${table.slug}`, { method: "POST" });
      const activeRes = await fetch(`/api/roulette/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
      const activeData = await activeRes.json();
      if (activeData.round) { setWatchingPayment(false); setRound(activeData.round); }
    } catch {}
    setScanning(false);
  }, [table.slug]);

  useEffect(() => {
    if (round || restoring) return;
    const ms = watchingPayment ? 5000 : 15000;
    const interval = setInterval(scanForRound, ms);
    return () => clearInterval(interval);
  }, [round, restoring, watchingPayment, scanForRound]);

  const handleSpin = useCallback(async () => {
    if (!round || spinning) return;
    setSpinning(true);

    try {
      const res = await fetch(`/api/roulette/${round.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bets, playerToken: tokenRef.current }),
      });
      const data = await res.json();
      if (!res.ok) { console.error("[Roulette] Error:", data.error); setSpinning(false); return; }
      // Start wheel animation with result
      setResultNumber(data.result);
      setTimeout(() => { setRound(data); setSpinning(false); }, 4200);
    } catch (err) {
      console.error("[Roulette] Fetch error:", err);
      setSpinning(false);
    }
  }, [round, spinning, bets]);

  const resetGame = useCallback(() => {
    setRound(null); setBets([]); setWatchingPayment(false);
    setPlayerProfile(null); setSpinning(false); setResultNumber(null);
  }, []);

  if (restoring) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-ink/30" /></div>;
  }

  const isFinished = round && round.status !== "playing";
  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>🎰</div>
          <div>
            <h1 className="text-xl font-bold text-ink">{table.title}</h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Payment phase */}
      {!round && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4 space-y-3">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
            <div className="grid grid-cols-4 gap-2">
              {betOptions.map((bet) => (
                <button key={bet} onClick={() => setSelectedBet(bet)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                    selectedBet === bet ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                  }`}
                  style={selectedBet === bet ? { backgroundColor: accentColor } : {}}>
                  {bet} CRC
                </button>
              ))}
            </div>
          </div>
          <ChancePayment
            recipientAddress={table.recipientAddress}
            amountCrc={selectedBet}
            gameType="roulette"
            gameId={table.slug}
            accentColor={accentColor}
            payLabel={`Roulette — ${selectedBet} CRC`}
            onPaymentInitiated={async () => { await scanForRound(); setWatchingPayment(true); }}
            onScan={scanForRound}
            scanning={scanning}
            paymentStatus={watchingPayment ? "watching" : "idle"}
            playerToken={tokenRef.current}
          />
        </div>
      )}

      {/* Game phase */}
      {round && !isFinished && (
        <GameUI
          bets={bets}
          setBets={setBets}
          betCrc={round.betCrc}
          accentColor={accentColor}
          locale={locale}
          onSpin={handleSpin}
          spinning={spinning}
          resultNumber={resultNumber}
        />
      )}

      {/* Result phase */}
      {round && isFinished && !spinning && (
        <ResultPanel
          round={round}
          locale={locale}
          accentColor={accentColor}
          playerName={playerProfile?.name || (round.playerAddress ? shortenAddress(round.playerAddress) : undefined)}
          playerAvatar={playerProfile?.imageUrl || undefined}
          onPlayAgain={resetGame}
        />
      )}
    </div>
  );
}
