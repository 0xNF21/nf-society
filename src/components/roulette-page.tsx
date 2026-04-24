"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RotateCcw, X, RefreshCw } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { ChancePayment } from "@/components/chance-payment";
import { PnlCard } from "@/components/pnl-card";
import { usePlayerToken } from "@/hooks/use-player-token";
import { darkSafeColor } from "@/lib/utils";
import {
  RED_NUMBERS, BLACK_NUMBERS, WHEEL_ORDER, BET_PAYOUTS, TABLE_ROWS,
  getNumberColor, generateResult, isBetWinning, areAdjacent, isValidCorner,
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

// TABLE_ROWS imported from roulette.ts

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
    // `onSpinEnd` est un callback parent — l'ajouter re-triggerait l'animation
    // a chaque nouveau render parent. On lance l'animation uniquement sur
    // changement de spinning/resultNumber.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  onRemoveBet,
  onClear,
  disabled,
  remaining,
  betCrc,
  chipValue,
  onChipValueChange,
  locale,
}: {
  bets: RouletteBet[];
  onAddBet: (bet: Omit<RouletteBet, "amount">, amount: number) => void;
  onRemoveBet: (bet: Omit<RouletteBet, "amount">, amount: number) => void;
  onClear: () => void;
  disabled: boolean;
  remaining: number;
  betCrc: number;
  chipValue: number;
  onChipValueChange: (v: number) => void;
  locale: "fr" | "en";
}) {
  const t = translations.roulette;

  const chipCount = useCallback((type: BetType, number?: number, numbers?: number[]): number => {
    try {
      return (bets || [])
        .filter((b) => {
          if (!b || b.type !== type) return false;
          if (type === "straight") return b.number === number;
          if (type === "split" || type === "corner") {
            if (!b.numbers || !numbers) return false;
            return b.numbers.length === numbers.length && b.numbers.every((n) => numbers.includes(n));
          }
          return true;
        })
        .reduce((s, b) => s + (b.amount || 0), 0);
    } catch { return 0; }
  }, [bets]);

  const canBet = !disabled && remaining > 0;
  const totalPlaced = betCrc - remaining;
  const effectiveChip = Math.min(chipValue, Math.max(remaining, 0));

  // Right-click to remove (desktop only — no long-press on mobile to avoid scroll conflicts)
  const handleContext = (e: React.MouseEvent, bet: Omit<RouletteBet, "amount">) => {
    try {
      e.preventDefault();
      onRemoveBet(bet, chipValue);
    } catch {}
  };

  // Build bet label for recap
  const betLabel = (b: RouletteBet): string => {
    if (b.type === "straight") return `#${b.number}`;
    if (b.type === "split") return `${b.numbers?.[0]}-${b.numbers?.[1]}`;
    if (b.type === "corner") return b.numbers?.join("/") || "";
    const labels: Record<string, Record<"fr" | "en", string>> = {
      red: { fr: "Rouge", en: "Red" }, black: { fr: "Noir", en: "Black" },
      odd: { fr: "Impair", en: "Odd" }, even: { fr: "Pair", en: "Even" },
      low: { fr: "1-18", en: "1-18" }, high: { fr: "19-36", en: "19-36" },
      dozen1: { fr: "1-12", en: "1-12" }, dozen2: { fr: "13-24", en: "13-24" },
      dozen3: { fr: "25-36", en: "25-36" },
      col1: { fr: "Col.1", en: "Col.1" }, col2: { fr: "Col.2", en: "Col.2" }, col3: { fr: "Col.3", en: "Col.3" },
    };
    return labels[b.type]?.[locale] || b.type;
  };

  // Cell button helper — wrapped in try-catch to prevent crash
  const cellClick = (bet: Omit<RouletteBet, "amount">) => {
    try {
      if (canBet && effectiveChip > 0) onAddBet(bet, effectiveChip);
    } catch (err) {
      console.error("[Roulette] cellClick error:", err);
    }
  };

  return (
    <div className="space-y-3">
      {/* ── Chip denomination selector ── */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold shrink-0">
          {t.chip[locale]}
        </span>
        <div className="flex gap-1.5 flex-1">
          {[1, 5, 10].map((v) => (
            <button
              key={v}
              onClick={() => onChipValueChange(v)}
              className={`flex-1 py-2 rounded-lg text-xs font-black transition-all ${
                chipValue === v
                  ? "bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 text-amber-900 shadow-lg shadow-yellow-400/30 scale-105"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* ── Live bet recap ── */}
      <div className="rounded-xl bg-white/10 p-3 space-y-2">
        <div className="flex items-center justify-between text-xs text-white/70 mb-1">
          <span className="font-bold">{totalPlaced} / {betCrc} CRC</span>
          <button onClick={onClear} disabled={bets.length === 0}
            className="text-red-400 hover:text-red-300 disabled:opacity-30 flex items-center gap-1 font-bold">
            <X className="w-3 h-3" /> {t.clear[locale]}
          </button>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full rounded-full transition-all duration-300"
            style={{ width: `${betCrc > 0 ? (totalPlaced / betCrc) * 100 : 0}%`, backgroundColor: remaining === 0 ? "#10B981" : "#FBBF24" }} />
        </div>
        {bets.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {bets.map((b, i) => (
              <span key={i} className="inline-flex items-center gap-1 text-[11px] font-bold bg-white/10 text-white/90 px-2 py-1 rounded-lg">
                <span className="text-yellow-400">{b.amount}</span>
                {betLabel(b)}
                <span className="text-white/30">x{BET_PAYOUTS[b.type]}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-white/30 text-center mt-1">{t.placeBets[locale]}</p>
        )}
      </div>

      {/* ── Number grid with split/corner dots ── */}
      <div className="space-y-0">
        {/* Zero */}
        <button
          onClick={() => cellClick({ type: "straight", number: 0 })}
          onContextMenu={(e) => handleContext(e, { type: "straight", number: 0 })}
          disabled={!canBet}
          className={`relative w-full h-12 rounded-t-xl text-sm font-bold text-white transition-all mb-1 ${
            chipCount("straight", 0) > 0 ? "ring-2 ring-yellow-400 ring-offset-1 ring-offset-[#0d4f2b]" : ""
          } ${canBet ? "hover:brightness-110 active:scale-[0.98]" : "opacity-60"}`}
          style={{ backgroundColor: COLOR_HEX.green }}
        >
          0
          {chipCount("straight", 0) > 0 && <BetBadge amount={chipCount("straight", 0)} />}
        </button>

        {/* Grid rows with split/corner dots */}
        {TABLE_ROWS.map((row, ri) => (
          <div key={ri}>
            {/* Split dots between this row and the row above */}
            {ri > 0 && (
              <div className="flex gap-1 mb-px">
                <div className="flex-1 grid grid-cols-12 gap-0.5">
                  {row.map((num, ci) => {
                    const above = TABLE_ROWS[ri - 1][ci];
                    const splitNums = [Math.min(num, above), Math.max(num, above)];
                    const splitChips = chipCount("split", undefined, splitNums);
                    // Corner dots (intersection of 4)
                    const hasCornerLeft = ci > 0;
                    const cornerNums = hasCornerLeft ? [
                      TABLE_ROWS[ri - 1][ci - 1], TABLE_ROWS[ri - 1][ci],
                      row[ci - 1], num,
                    ].sort((a, b) => a - b) : [];
                    const cornerChips = hasCornerLeft ? chipCount("corner", undefined, cornerNums) : 0;
                    return (
                      <div key={`vsplit-${ri}-${ci}`} className="relative h-3 flex items-center justify-center">
                        {/* Vertical split dot */}
                        <button
                          onClick={() => cellClick({ type: "split", numbers: splitNums })}
                          onContextMenu={(e) => handleContext(e, { type: "split", numbers: splitNums })}
                          className={`w-3 h-3 rounded-full transition-all z-10 ${
                            splitChips > 0
                              ? "bg-yellow-400 shadow-md shadow-yellow-400/50"
                              : "bg-white/0 hover:bg-white/30"
                          }`}
                          title={`Split ${splitNums[0]}-${splitNums[1]}`}
                        />
                        {splitChips > 0 && (
                          <span className="absolute -top-1 left-1/2 translate-x-1 text-[8px] font-black text-yellow-400 z-20">{splitChips}</span>
                        )}
                        {/* Corner dot (left side) */}
                        {hasCornerLeft && (
                          <>
                            <button
                              onClick={() => cellClick({ type: "corner", numbers: cornerNums })}
                              onContextMenu={(e) => handleContext(e, { type: "corner", numbers: cornerNums })}
                              className={`absolute -left-1 w-3 h-3 rounded-full transition-all z-10 ${
                                cornerChips > 0
                                  ? "bg-yellow-400 shadow-md shadow-yellow-400/50"
                                  : "bg-white/0 hover:bg-white/30"
                              }`}
                              title={`Corner ${cornerNums.join("/")}`}
                            />
                            {cornerChips > 0 && (
                              <span className="absolute -top-1 -left-1 -translate-x-2 text-[8px] font-black text-yellow-400 z-20">{cornerChips}</span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="w-10" /> {/* Spacer for column bet */}
              </div>
            )}

            {/* Number row + horizontal split dots + column bet */}
            <div className="flex gap-1">
              <div className="flex-1 relative">
                <div className="grid grid-cols-12 gap-0.5">
                  {row.map((num) => {
                    const color = getNumberColor(num);
                    const chips = chipCount("straight", num);
                    return (
                      <button
                        key={num}
                        onClick={() => cellClick({ type: "straight", number: num })}
                        onContextMenu={(e) => handleContext(e, { type: "straight", number: num })}
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
                {/* Horizontal split dots (between adjacent cells in the same row) */}
                {row.slice(0, -1).map((num, ci) => {
                  const right = row[ci + 1];
                  const splitNums = [Math.min(num, right), Math.max(num, right)];
                  const splitChips = chipCount("split", undefined, splitNums);
                  const leftPct = ((ci + 1) / 12) * 100;
                  return (
                    <button
                      key={`hsplit-${ri}-${ci}`}
                      onClick={() => cellClick({ type: "split", numbers: splitNums })}
                      onContextMenu={(e) => handleContext(e, { type: "split", numbers: splitNums })}
                      className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full transition-all z-10 ${
                        splitChips > 0
                          ? "bg-yellow-400 shadow-md shadow-yellow-400/50"
                          : "bg-white/0 hover:bg-white/30"
                      }`}
                      style={{ left: `${leftPct}%` }}
                      title={`Split ${splitNums[0]}-${splitNums[1]}`}
                    />
                  );
                })}
              </div>
              {/* Column 2:1 */}
              {(() => {
                const colType = `col${3 - ri}` as BetType;
                const chips = chipCount(colType);
                return (
                  <button
                    onClick={() => cellClick({ type: colType })}
                    onContextMenu={(e) => handleContext(e, { type: colType })}
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
          </div>
        ))}
      </div>

      {/* ── Zone bets ── */}
      <div className="space-y-2 mt-2">
        <div className="grid grid-cols-3 gap-1.5">
          {([["dozen1", t.dz1[locale]], ["dozen2", t.dz2[locale]], ["dozen3", t.dz3[locale]]] as const).map(([type, label]) => {
            const chips = chipCount(type as BetType);
            return (
              <button key={type}
                onClick={() => cellClick({ type: type as BetType })}
                onContextMenu={(e) => handleContext(e, { type: type as BetType })}
                disabled={!canBet}
                className={`h-11 rounded-xl text-xs font-bold text-white/80 bg-white/10 transition-all flex items-center justify-center gap-1 ${
                  chips > 0 ? "ring-2 ring-yellow-400 text-white bg-white/15" : "" } ${canBet ? "hover:bg-white/20 active:scale-95" : "opacity-60"}`}>
                {label} <span className="text-[9px] text-white/40">x3</span>
                {chips > 0 && <ZoneBadge amount={chips} />}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {([
            ["low", t.low[locale], undefined], ["even", t.even[locale], undefined],
            ["red", t.red[locale], COLOR_HEX.red], ["black", t.black[locale], COLOR_HEX.black],
            ["odd", t.odd[locale], undefined], ["high", t.high[locale], undefined],
          ] as const).map(([type, label, bg]) => {
            const chips = chipCount(type as BetType);
            return (
              <button key={type}
                onClick={() => cellClick({ type: type as BetType })}
                onContextMenu={(e) => handleContext(e, { type: type as BetType })}
                disabled={!canBet}
                className={`h-11 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  bg ? "text-white" : "text-white/80 bg-white/10" } ${chips > 0 ? "ring-2 ring-yellow-400 brightness-110" : ""
                } ${canBet ? "hover:brightness-110 active:scale-95" : "opacity-60"}`}
                style={bg ? { backgroundColor: bg } : undefined}>
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

      <button
        onClick={onPlayAgain}
        className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90 flex items-center justify-center gap-2"
        style={{ backgroundColor: accentColor }}
      >
        <RefreshCw className="w-4 h-4" />
        {t.playAgain[locale]}
      </button>

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
  showSpinButton = true,
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
  /** When false, the Spin button is hidden (used during the payment phase). Default: true. */
  showSpinButton?: boolean;
}) {
  const t = translations.roulette;
  const totalPlaced = bets.reduce((s, b) => s + b.amount, 0);
  const remaining = betCrc - totalPlaced;
  const [wheelDone, setWheelDone] = useState(false);
  const [chipValue, setChipValue] = useState(1);

  useEffect(() => { if (!spinning) setWheelDone(false); }, [spinning]);

  // Match bets by type + number/numbers
  const betMatches = (a: Omit<RouletteBet, "amount">, b: RouletteBet): boolean => {
    if (a.type !== b.type) return false;
    if (a.type === "straight") return a.number === b.number;
    if (a.type === "split" || a.type === "corner") {
      if (!a.numbers || !b.numbers) return false;
      return a.numbers.length === b.numbers.length && a.numbers.every((n) => b.numbers!.includes(n));
    }
    return true;
  };

  const addBet = useCallback((bet: Omit<RouletteBet, "amount">, amount: number) => {
    try {
      const toPlace = Math.min(amount, Math.max(remaining, 0));
      if (toPlace <= 0 || !bet || !bet.type) return;
      const existing = bets.findIndex((b) => betMatches(bet, b));
      if (existing >= 0) {
        const updated = [...bets];
        updated[existing] = { ...updated[existing], amount: updated[existing].amount + toPlace };
        setBets(updated);
      } else {
        setBets([...bets, { ...bet, amount: toPlace } as RouletteBet]);
      }
    } catch (err) { console.error("[Roulette] addBet error:", err); }
  }, [bets, remaining, setBets]);

  const removeBet = useCallback((bet: Omit<RouletteBet, "amount">, amount: number) => {
    try {
      if (!bet || !bet.type) return;
      const idx = bets.findIndex((b) => betMatches(bet, b));
      if (idx < 0) return;
      const current = bets[idx];
      const newAmount = current.amount - amount;
      if (newAmount <= 0) {
        setBets(bets.filter((_, i) => i !== idx));
      } else {
        const updated = [...bets];
        updated[idx] = { ...updated[idx], amount: newAmount };
        setBets(updated);
      }
    } catch (err) { console.error("[Roulette] removeBet error:", err); }
  }, [bets, setBets]);

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
          onRemoveBet={removeBet}
          onClear={() => setBets([])}
          disabled={spinning}
          remaining={remaining}
          chipValue={chipValue}
          onChipValueChange={setChipValue}
          betCrc={betCrc}
          locale={locale}
        />
      </div>

      {/* Spin button */}
      {showSpinButton && (
        <button
          onClick={onSpin}
          disabled={totalPlaced === 0 || totalPlaced > betCrc || spinning}
          className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2"
          style={{ backgroundColor: accentColor }}
        >
          <RotateCcw className="w-5 h-5" />
          {spinning ? t.spinning[locale] : t.spin[locale]}
        </button>
      )}
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

  const performSpin = useCallback((bet: number, spinBets: RouletteBet[]) => {
    if (spinning) return;
    const total = spinBets.reduce((s, b) => s + b.amount, 0);
    if (total === 0 || total > bet) return;

    const num = generateResult();
    setResult(null);
    setResultNumber(num);
    setSpinning(true);

    setTimeout(() => {
      let payoutCrc = 0;
      for (const b of spinBets) {
        if (isBetWinning(b, num)) {
          payoutCrc += Math.floor(b.amount * BET_PAYOUTS[b.type] * 100) / 100;
        }
      }
      payoutCrc = Math.floor(payoutCrc * 100) / 100;

      setResult({
        status: payoutCrc > 0 ? "won" : "lost",
        betCrc: bet,
        bets: spinBets,
        result: num,
        payoutCrc,
        id: 0, tableId: 0, playerAddress: "",
        outcome: payoutCrc > 0 ? "win" : "loss",
        payoutStatus: payoutCrc > 0 ? "success" : "none",
        createdAt: new Date().toISOString(),
      });
      setSpinning(false);
    }, 4200);
  }, [spinning]);

  const handleSpin = useCallback(() => performSpin(selectedBet, bets), [performSpin, selectedBet, bets]);

  const resetGame = useCallback(() => {
    setResult(null);
    setBets([]);
    setSpinning(false);
    setResultNumber(null);
  }, []);

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <div className="mb-6">
        <Link
          href="/chance"
          onClick={(e) => {
            if (result && !spinning) {
              e.preventDefault();
              resetGame();
            }
          }}
          className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4"
        >
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

// ── Error Boundary ──────────────────────────────────────

import React from "react";

class RouletteErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.error("[Roulette] Crash:", error); }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function RouletteCrashFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-4">
        <p className="text-4xl">🎰</p>
        <p className="text-lg font-bold text-ink">Oops — erreur de chargement</p>
        <p className="text-sm text-ink/50">Rechargez la page pour reprendre votre partie.</p>
        <button onClick={() => window.location.reload()}
          className="px-6 py-2 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700">
          Recharger
        </button>
      </div>
    </div>
  );
}

export default function RoulettePageClient({ table }: { table: RouletteTable }) {
  const { isDemo } = useDemo();
  return (
    <RouletteErrorBoundary fallback={<RouletteCrashFallback />}>
      {isDemo ? <DemoRouletteGame table={table} /> : <RealRouletteGame table={table} />}
    </RouletteErrorBoundary>
  );
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

  // Restore active round — re-runs when token becomes available after SSR hydration
  const tokenValue = tokenRef.current;
  useEffect(() => {
    if (!tokenValue) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/roulette/active?tableSlug=${table.slug}&token=${tokenValue}`);
        const data = await res.json();
        if (data.round && active) setRound(data.round);
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

  const scanForRound = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`/api/roulette-scan?tableSlug=${table.slug}`, { method: "POST" });
      const activeRes = await fetch(`/api/roulette/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
      const activeData = await activeRes.json();
      if (activeData.round) { setWatchingPayment(false); setRound(activeData.round); }
    } catch {}
    setScanning(false);
  }, [table.slug, tokenRef]);

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
      // Start wheel animation with the result
      setResultNumber(data.result);
      // After 4.2s (wheel done): apply result + refetch from /active to
      // guarantee the UI reflects every DB field so ResultPanel renders
      // without F5.
      setTimeout(async () => {
        setRound(data);
        setSpinning(false);
        try {
          const refreshRes = await fetch(
            `/api/roulette/active?tableSlug=${table.slug}&token=${tokenRef.current}`,
            { cache: "no-store" },
          );
          const refreshData = await refreshRes.json();
          if (refreshData?.round) setRound(refreshData.round);
        } catch {}
      }, 4200);
    } catch (err) {
      console.error("[Roulette] Fetch error:", err);
      setSpinning(false);
    }
  }, [round, spinning, bets, table.slug, tokenRef]);

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
        <Link
          href="/chance"
          onClick={(e) => {
            if (isFinished && !spinning) {
              e.preventDefault();
              resetGame();
            }
          }}
          className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4"
        >
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

      {/* Payment phase — bet selector + table (place bets) + payment on the same page */}
      {!round && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4 space-y-3">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
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

          <GameUI
            bets={bets}
            setBets={setBets}
            betCrc={selectedBet}
            accentColor={accentColor}
            locale={locale}
            onSpin={() => {}}
            spinning={false}
            resultNumber={null}
            showSpinButton={false}
          />

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
