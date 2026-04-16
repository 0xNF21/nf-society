"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { ChancePayment } from "@/components/chance-payment";
import { PnlCard } from "@/components/pnl-card";
import { usePlayerToken } from "@/hooks/use-player-token";
import { darkSafeColor } from "@/lib/utils";
import {
  PEG_ROWS, BUCKET_COUNT, MULTIPLIERS,
  createInitialState, dropOneBall, cashout as cashoutState,
  calculatePayout, calculateCashoutAmount,
} from "@/lib/plinko";
import type { BallResult, VisibleState } from "@/lib/plinko";

type PlinkoTable = {
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

// Ball value options (CRC per ball)
const BALL_VALUE_OPTIONS = [0.5, 1, 2, 5, 10, 25, 50];

// Drop mode options (how many balls per click). "all" = all remaining
type DropMode = 1 | 2 | 5 | "all";
const DROP_MODES: DropMode[] = [1, 2, 5, "all"];

// ── Bucket color helpers ──────────────────────────────

function getBucketColor(multiplier: number): string {
  if (multiplier >= 15) return "#EF4444";
  if (multiplier >= 5) return "#F97316";
  if (multiplier >= 2) return "#EAB308";
  if (multiplier >= 1) return "#22C55E";
  if (multiplier >= 0.5) return "#3B82F6";
  return "#6366F1";
}

// ── SVG constants & helpers ──────────────────────────

const SVG_W = 340;
const SVG_H = 400;
const PEG_R = 4;
const BALL_R = 7;
const TOP_PAD = 30;
const BOT_PAD = 55;
const ROW_H = (SVG_H - TOP_PAD - BOT_PAD) / PEG_ROWS;

function getPegX(row: number, col: number) {
  const pegsInRow = row + 3;
  const spacing = SVG_W / (pegsInRow + 1);
  return spacing * (col + 1);
}
function getPegY(row: number) { return TOP_PAD + row * ROW_H; }

function getSmoothBallPos(path: number[], step: number, sub: number): { x: number; y: number } {
  if (!path || path.length === 0) return { x: SVG_W / 2, y: TOP_PAD - 15 };
  if (step < 0) return { x: SVG_W / 2, y: TOP_PAD - 15 + sub * 20 };
  if (step >= PEG_ROWS) {
    const bucketIdx = path.reduce((s, d) => s + d, 0);
    const bucketW = SVG_W / BUCKET_COUNT;
    return { x: bucketW * bucketIdx + bucketW / 2, y: SVG_H - BOT_PAD + 20 };
  }

  const safeStep = Math.min(step, path.length - 1);
  if (safeStep < 0) return { x: SVG_W / 2, y: TOP_PAD };

  const cumRight = path.slice(0, safeStep + 1).reduce((s, d) => s + d, 0);
  const pegsInRow = safeStep + 3;
  const spacing = SVG_W / (pegsInRow + 1);
  const dir = path[safeStep] ?? 0;
  const curX = spacing * (cumRight + 1) + spacing * dir * 0.4;
  const curY = getPegY(safeStep) + ROW_H * 0.4;

  let nextX: number, nextY: number;
  if (safeStep + 1 >= PEG_ROWS) {
    const bucketIdx = path.reduce((s, d) => s + d, 0);
    const bucketW = SVG_W / BUCKET_COUNT;
    nextX = bucketW * bucketIdx + bucketW / 2;
    nextY = SVG_H - BOT_PAD + 20;
  } else {
    const nextCumRight = path.slice(0, safeStep + 2).reduce((s, d) => s + d, 0);
    const nextPegsInRow = safeStep + 4;
    const nextSpacing = SVG_W / (nextPegsInRow + 1);
    const nextDir = path[safeStep + 1] ?? 0;
    nextX = nextSpacing * (nextCumRight + 1) + nextSpacing * nextDir * 0.4;
    nextY = getPegY(safeStep + 1) + ROW_H * 0.4;
  }

  const eased = sub * sub;
  const x = curX + (nextX - curX) * eased;
  const y = curY + (nextY - curY) * eased;
  const wobble = Math.sin(safeStep * 7.3 + sub * 12) * 2;

  return { x: x + wobble, y };
}

// ── Plinko Board (single ball) ──────────────────────

function PlinkoBoard({
  balls,
  flyingBallPath,
  animStep,
  animSub,
  accentColor,
}: {
  balls: BallResult[];
  flyingBallPath: number[] | null;
  animStep: number;
  animSub: number;
  accentColor: string;
}) {
  const bucketCounts: number[] = Array(BUCKET_COUNT).fill(0);
  for (const b of balls) bucketCounts[b.bucket]++;

  const flyingPos = flyingBallPath ? getSmoothBallPos(flyingBallPath, animStep, animSub) : null;

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4 mb-4">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full max-w-[340px] mx-auto" style={{ overflow: "visible" }}>
        {/* Pegs */}
        {Array.from({ length: PEG_ROWS }, (_, row) => {
          const pegsInRow = row + 3;
          return Array.from({ length: pegsInRow }, (_, col) => (
            <circle key={`peg-${row}-${col}`}
              cx={getPegX(row, col)} cy={getPegY(row)} r={PEG_R}
              className="fill-ink/20 dark:fill-white/20"
            />
          ));
        })}

        {/* Buckets */}
        {MULTIPLIERS.map((mult, i) => {
          const bucketW = SVG_W / BUCKET_COUNT;
          const x = bucketW * i;
          const y = SVG_H - BOT_PAD + 5;
          const count = bucketCounts[i];
          const isActive = count > 0;
          const color = getBucketColor(mult);
          return (
            <g key={`bucket-${i}`}>
              <rect x={x + 2} y={y} width={bucketW - 4} height={30} rx={6}
                fill={color} opacity={isActive ? 1 : 0.25}
                className="transition-opacity duration-300" />
              <text x={x + bucketW / 2} y={y + 12} textAnchor="middle"
                fontSize={mult >= 10 ? 7 : 8} fontWeight="bold" fill="white"
                opacity={isActive ? 1 : 0.7}>
                {mult}x
              </text>
              {count > 0 && (
                <text x={x + bucketW / 2} y={y + 25} textAnchor="middle"
                  fontSize={8} fontWeight="bold" fill="white">
                  {count}
                </text>
              )}
            </g>
          );
        })}

        {/* Flying ball */}
        {flyingPos && (
          <circle cx={flyingPos.x} cy={flyingPos.y} r={BALL_R}
            fill={accentColor} opacity={0.9}
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}
          />
        )}
      </svg>
    </div>
  );
}

// ── Single-ball animation hook ─────────────────────

function useSingleBallAnim() {
  const [flyingPath, setFlyingPath] = useState<number[] | null>(null);
  const [animStep, setAnimStep] = useState(-1);
  const [animSub, setAnimSub] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completeRef = useRef<(() => void) | null>(null);

  const start = useCallback((path: number[], onComplete: () => void) => {
    setFlyingPath(path);
    setAnimStep(-1);
    setAnimSub(0);
    completeRef.current = onComplete;

    const startTime = performance.now();
    const entryDur = 160;
    const rowDur = (r: number) => 150 - r * 6;
    const totalDur = entryDur + Array.from({ length: PEG_ROWS }, (_, r) => rowDur(r)).reduce((s, d) => s + d, 0);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const elapsed = performance.now() - startTime;
      let step = -1;
      let sub = 0;

      if (elapsed < entryDur) {
        step = -1;
        sub = elapsed / entryDur;
      } else {
        step = PEG_ROWS;
        sub = 1;
        let t = elapsed - entryDur;
        for (let r = 0; r < PEG_ROWS; r++) {
          const dur = rowDur(r);
          if (t < dur) { step = r; sub = Math.min(t / dur, 1); break; }
          t -= dur;
        }
      }

      setAnimStep(step);
      setAnimSub(sub);

      if (elapsed >= totalDur) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setTimeout(() => {
          setFlyingPath(null);
          completeRef.current?.();
        }, 200);
      }
    }, 33);
  }, []);

  const reset = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setFlyingPath(null);
    setAnimStep(-1);
    setAnimSub(0);
  }, []);

  useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  return { flyingPath, animStep, animSub, running: flyingPath !== null, start, reset };
}

// ── Result Panel ──────────────────────────────────────

function ResultPanel({
  round, accentColor, locale, playerName, playerAvatar, onPlayAgain,
}: {
  round: RoundResponse; accentColor: string; locale: "fr" | "en";
  playerName?: string; playerAvatar?: string; onPlayAgain: () => void;
}) {
  const t = translations.plinko;
  const payout = round.finalPayout;
  const won = payout > round.totalBet;
  const cashedOut = round.status === "cashed_out";
  const net = payout - round.totalBet;

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-6 text-center ${
        won ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
          : cashedOut ? "bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800"
          : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
      }`}>
        <p className="text-4xl mb-2">{won ? "🎉" : cashedOut ? "🏁" : "😔"}</p>
        <p className={`text-4xl font-black mb-2 ${won ? "text-emerald-600" : cashedOut ? "text-sky-600" : "text-red-500"}`}>
          {payout.toFixed(2)} CRC
        </p>
        <p className="font-bold text-lg text-ink">
          {won ? t.youWin[locale] : cashedOut ? t.cashedOut[locale] : t.youLose[locale]}
        </p>
        <p className="text-sm text-ink/60 mt-1">
          {round.balls.length}/{round.ballCount} {t.balls[locale]} ({round.ballValue} CRC {t.perBall[locale]})
        </p>
        <p className={`text-sm font-bold mt-1 ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {net >= 0 ? "+" : ""}{net.toFixed(2)} CRC net
        </p>
      </div>

      <PnlCard gameType="plinko" result={won ? "win" : "loss"} betCrc={round.totalBet}
        gainCrc={Math.round(net)} playerName={playerName || "Player"} playerAvatar={playerAvatar}
        stats={`${round.balls.length}/${round.ballCount} ${t.balls[locale]} | ${payout.toFixed(2)} CRC`}
        date={new Date().toLocaleDateString()} locale={locale} />

      <button onClick={onPlayAgain}
        className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90"
        style={{ backgroundColor: accentColor }}>
        {t.playAgain[locale]}
      </button>
    </div>
  );
}

// ── Bet Selector ──────────────────────────────────────

function BetSelector({
  totalOptions, selectedTotal, selectedBallValue, selectedDropMode,
  onTotalChange, onBallValueChange, onDropModeChange,
  accentColor, locale,
}: {
  totalOptions: number[]; selectedTotal: number; selectedBallValue: number; selectedDropMode: DropMode;
  onTotalChange: (v: number) => void; onBallValueChange: (v: number) => void; onDropModeChange: (m: DropMode) => void;
  accentColor: string; locale: "fr" | "en";
}) {
  const t = translations.plinko;
  const ballCount = Math.floor(selectedTotal / selectedBallValue);
  const validCombo = selectedTotal % selectedBallValue === 0 && ballCount >= 1;
  const validBVs = BALL_VALUE_OPTIONS.filter((v) => Number.isInteger(selectedTotal / v) && v <= selectedTotal);

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
      {/* Total bet */}
      <div>
        <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest mb-3">{t.chooseTotal[locale]}</h2>
        <div className="grid grid-cols-4 gap-2">
          {totalOptions.map((v) => (
            <button key={v} onClick={() => onTotalChange(v)}
              className={`py-3 rounded-xl text-sm font-bold transition-all ${
                selectedTotal === v ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
              }`}
              style={selectedTotal === v ? { backgroundColor: accentColor } : {}}>
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Ball value */}
      <div>
        <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest mb-3">{t.choosePerBall[locale]}</h2>
        <div className="grid grid-cols-4 gap-2">
          {BALL_VALUE_OPTIONS.map((v) => {
            const isValid = validBVs.includes(v);
            return (
              <button key={v} onClick={() => isValid && onBallValueChange(v)} disabled={!isValid}
                className={`py-3 rounded-xl text-sm font-bold transition-all ${
                  selectedBallValue === v ? "text-white shadow-lg scale-105"
                    : isValid ? "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                    : "bg-ink/5 dark:bg-white/5 text-ink/20 cursor-not-allowed"
                }`}
                style={selectedBallValue === v ? { backgroundColor: accentColor } : {}}>
                {v}
              </button>
            );
          })}
        </div>
      </div>

      {/* Drop mode */}
      <div>
        <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest mb-3">{t.dropMode[locale]}</h2>
        <div className="grid grid-cols-4 gap-2">
          {DROP_MODES.map((m) => {
            const label = m === "all" ? t.dropAll[locale] : `×${m}`;
            return (
              <button key={String(m)} onClick={() => onDropModeChange(m)}
                className={`py-3 rounded-xl text-sm font-bold transition-all ${
                  selectedDropMode === m ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                }`}
                style={selectedDropMode === m ? { backgroundColor: accentColor } : {}}>
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      {validCombo ? (
        <p className="text-xs text-center text-ink/50">
          = <span className="font-bold text-ink">{ballCount} {ballCount === 1 ? t.ball[locale] : t.balls[locale]}</span>
        </p>
      ) : (
        <p className="text-xs text-center text-red-500">{t.incompatibleCombo[locale]}</p>
      )}
    </div>
  );
}

// ── Demo Game ──────────────────────────────────────

function DemoPlinkoGame({ table }: { table: PlinkoTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.plinko;

  const [selectedTotal, setSelectedTotal] = useState<number>(table.betOptions[0] || 5);
  const [selectedBallValue, setSelectedBallValue] = useState<number>(1);
  const [selectedDropMode, setSelectedDropMode] = useState<DropMode>(1);
  const [state, setState] = useState<ReturnType<typeof createInitialState> | null>(null);
  const [result, setResult] = useState<RoundResponse | null>(null);
  const [batchRemaining, setBatchRemaining] = useState(0);
  const anim = useSingleBallAnim();

  const validCombo = selectedTotal % selectedBallValue === 0;

  // Keep ball value valid when total changes
  useEffect(() => {
    if (selectedTotal % selectedBallValue !== 0) {
      const validBVs = BALL_VALUE_OPTIONS.filter((v) => selectedTotal % v === 0 && v <= selectedTotal);
      if (validBVs.length > 0) setSelectedBallValue(validBVs[0]);
    }
  }, [selectedTotal, selectedBallValue]);

  const handleStart = useCallback(() => {
    if (!validCombo) return;
    setState(createInitialState(selectedTotal, selectedBallValue));
    setResult(null);
  }, [selectedTotal, selectedBallValue, validCombo]);

  // Internal: drop one ball (called at start of each batch step)
  const dropNextInBatch = useCallback((currentState: typeof state, remaining: number) => {
    if (!currentState || currentState.status !== "playing") { setBatchRemaining(0); return; }
    const newState = dropOneBall(currentState);
    const latestBall = newState.balls[newState.balls.length - 1];

    anim.start(latestBall.path, () => {
      setState(newState);
      const newRemaining = remaining - 1;
      const canContinue = newState.status === "playing" && newRemaining > 0;

      if (newState.status === "finished") {
        setResult({
          status: newState.status,
          totalBet: newState.totalBet,
          ballValue: newState.ballValue,
          ballCount: newState.ballCount,
          ballsRemaining: 0,
          balls: newState.balls,
          accumulatedPayout: newState.accumulatedPayout,
          cashoutAmount: 0,
          finalPayout: calculatePayout(newState),
          id: 0, tableId: 0, playerAddress: "",
          outcome: "win",
          payoutCrc: calculatePayout(newState),
          payoutStatus: "success",
          createdAt: new Date().toISOString(),
        });
        setBatchRemaining(0);
      } else if (canContinue) {
        setBatchRemaining(newRemaining);
        setTimeout(() => dropNextInBatch(newState, newRemaining), 100);
      } else {
        setBatchRemaining(0);
      }
    });
  }, [anim]);

  const handleDrop = useCallback(() => {
    if (!state || anim.running || batchRemaining > 0 || state.status !== "playing") return;
    const ballsLeft = state.ballCount - state.balls.length;
    const batchSize = selectedDropMode === "all" ? ballsLeft : Math.min(selectedDropMode, ballsLeft);
    setBatchRemaining(batchSize);
    dropNextInBatch(state, batchSize);
  }, [state, anim, batchRemaining, selectedDropMode, dropNextInBatch]);

  const handleCashout = useCallback(() => {
    if (!state || anim.running || state.status !== "playing") return;
    const newState = cashoutState(state);
    setResult({
      status: newState.status,
      totalBet: newState.totalBet,
      ballValue: newState.ballValue,
      ballCount: newState.ballCount,
      ballsRemaining: newState.ballCount - newState.balls.length,
      balls: newState.balls,
      accumulatedPayout: newState.accumulatedPayout,
      cashoutAmount: 0,
      finalPayout: calculatePayout(newState),
      id: 0, tableId: 0, playerAddress: "",
      outcome: "win",
      payoutCrc: calculatePayout(newState),
      payoutStatus: "success",
      createdAt: new Date().toISOString(),
    });
    setState(newState);
  }, [state, anim]);

  const resetGame = useCallback(() => {
    setState(null);
    setResult(null);
    anim.reset();
  }, [anim]);

  const showBet = !state && !result;
  const showGame = state && state.status === "playing" && !result;
  const showResult = result;

  const cashoutAmount = state ? calculateCashoutAmount(state) : 0;
  const ballsLeft = state ? state.ballCount - state.balls.length : 0;

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>📌</div>
          <div>
            <h1 className="text-xl font-bold text-ink">
              {table.title} <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">DEMO</span>
            </h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {showBet && (
        <div className="space-y-6">
          <BetSelector
            totalOptions={table.betOptions as number[]}
            selectedTotal={selectedTotal}
            selectedBallValue={selectedBallValue}
            selectedDropMode={selectedDropMode}
            onTotalChange={setSelectedTotal}
            onBallValueChange={setSelectedBallValue}
            onDropModeChange={setSelectedDropMode}
            accentColor={accentColor}
            locale={locale}
          />

          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4">
            <p className="text-xs text-ink/40 text-center mb-3 uppercase tracking-widest">{t.multiplier[locale]}s</p>
            <div className="flex gap-1 justify-center flex-wrap">
              {MULTIPLIERS.map((m, i) => (
                <span key={i} className="text-[10px] font-bold px-1.5 py-1 rounded"
                  style={{ backgroundColor: getBucketColor(m) + "25", color: getBucketColor(m) }}>{m}x</span>
              ))}
            </div>
          </div>

          <PlinkoBoard balls={[]} flyingBallPath={null} animStep={-1} animSub={0} accentColor={accentColor} />

          <button onClick={handleStart} disabled={!validCombo}
            className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2"
            style={{ backgroundColor: accentColor }}>
            📌 {selectedTotal} CRC (Demo)
          </button>
        </div>
      )}

      {showGame && state && (
        <div className="space-y-4">
          <PlinkoBoard
            balls={state.balls}
            flyingBallPath={anim.flyingPath}
            animStep={anim.animStep}
            animSub={anim.animSub}
            accentColor={accentColor}
          />

          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.ballsRemaining[locale]}</p>
              <p className="text-xl font-bold text-ink">{ballsLeft} / {state.ballCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.accumulated[locale]}</p>
              <p className="text-xl font-bold" style={{ color: accentColor }}>{state.accumulatedPayout.toFixed(2)} CRC</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleCashout} disabled={anim.running || batchRemaining > 0}
              className="py-4 rounded-xl font-bold text-base bg-ink/5 dark:bg-white/10 text-ink hover:bg-ink/10 disabled:opacity-30">
              {t.cashout[locale]} {cashoutAmount.toFixed(2)}
            </button>
            <button onClick={handleDrop} disabled={anim.running || batchRemaining > 0 || ballsLeft === 0}
              className="py-4 rounded-xl font-bold text-base text-white hover:opacity-90 disabled:opacity-30"
              style={{ backgroundColor: accentColor }}>
              📌 {selectedDropMode === "all" ? t.dropAll[locale] : selectedDropMode === 1 ? t.dropOne[locale] : `×${selectedDropMode}`}
            </button>
          </div>
        </div>
      )}

      {showResult && result && (
        <div>
          <PlinkoBoard
            balls={result.balls}
            flyingBallPath={null}
            animStep={-1}
            animSub={0}
            accentColor={accentColor}
          />
          <ResultPanel round={result} accentColor={accentColor} locale={locale} onPlayAgain={resetGame} />
        </div>
      )}
    </div>
  );
}

// ── Main export ──────────────────────────────────────

export default function PlinkoPageClient({ table }: { table: PlinkoTable }) {
  const { isDemo } = useDemo();
  if (isDemo) return <DemoPlinkoGame table={table} />;
  return <RealPlinkoGame table={table} />;
}

// ── Real Game ──────────────────────────────────────

function RealPlinkoGame({ table }: { table: PlinkoTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.plinko;
  const tokenRef = usePlayerToken("plinko", table.slug);

  const [selectedTotal, setSelectedTotal] = useState<number>(table.betOptions[0] || 5);
  const [selectedBallValue, setSelectedBallValue] = useState<number>(1);
  const [selectedDropMode, setSelectedDropMode] = useState<DropMode>(1);
  const [round, setRound] = useState<RoundResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [playerProfile, setPlayerProfile] = useState<{ name?: string; imageUrl?: string | null } | null>(null);
  const [restoring, setRestoring] = useState(true);
  const [dropInFlight, setDropInFlight] = useState(false);
  const [batchRemaining, setBatchRemaining] = useState(0);
  const anim = useSingleBallAnim();

  const validCombo = selectedTotal % selectedBallValue === 0;

  // Keep ball value valid
  useEffect(() => {
    if (selectedTotal % selectedBallValue !== 0) {
      const validBVs = BALL_VALUE_OPTIONS.filter((v) => selectedTotal % v === 0 && v <= selectedTotal);
      if (validBVs.length > 0) setSelectedBallValue(validBVs[0]);
    }
  }, [selectedTotal, selectedBallValue]);

  // Restore active round
  useEffect(() => {
    if (!tokenRef.current) { setRestoring(false); return; }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/plinko/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
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
        const res = await fetch("/api/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ addresses: [round.playerAddress] }) });
        const data = await res.json();
        const profile = data.profiles?.[round.playerAddress.toLowerCase()];
        if (profile) setPlayerProfile(profile);
      } catch {}
    })();
  }, [round?.playerAddress, playerProfile]);

  const scanForRound = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`/api/plinko-scan?tableSlug=${table.slug}`, { method: "POST" });
      const activeRes = await fetch(`/api/plinko/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
      const activeData = await activeRes.json();
      if (activeData.round) { setWatchingPayment(false); setRound(activeData.round); }
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

  // Drop one ball via server, animate, then call onDone with the result
  const doOneDrop = useCallback(async (currentRound: RoundResponse, onDone: (next: RoundResponse) => void) => {
    try {
      const res = await fetch(`/api/plinko/${currentRound.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drop", playerToken: tokenRef.current }),
      });
      const data = await res.json() as RoundResponse;
      if (!res.ok) {
        console.error("[Plinko] Drop error:", (data as any).error);
        setDropInFlight(false);
        setBatchRemaining(0);
        return;
      }

      const latestBall = data.balls[data.balls.length - 1];
      if (!latestBall) {
        setRound(data);
        onDone(data);
        return;
      }

      // Keep the previous state's balls during animation (don't spoil)
      const prevBalls = currentRound.balls;
      setRound({ ...data, balls: prevBalls });

      anim.start(latestBall.path, () => {
        setRound(data);
        onDone(data);
      });
    } catch (err) {
      console.error("[Plinko] Drop fetch error:", err);
      setDropInFlight(false);
      setBatchRemaining(0);
    }
  }, [anim]);

  const handleDrop = useCallback(async () => {
    if (!round || anim.running || dropInFlight || batchRemaining > 0 || round.status !== "playing") return;
    const ballsLeft = round.ballsRemaining;
    const batchSize = selectedDropMode === "all" ? ballsLeft : Math.min(selectedDropMode, ballsLeft);
    if (batchSize <= 0) return;
    setDropInFlight(true);
    setBatchRemaining(batchSize);

    const runBatch = (currentRound: RoundResponse, remaining: number) => {
      if (remaining <= 0 || currentRound.status !== "playing") {
        setDropInFlight(false);
        setBatchRemaining(0);
        return;
      }
      doOneDrop(currentRound, (next) => {
        const newRemaining = remaining - 1;
        if (newRemaining > 0 && next.status === "playing") {
          setBatchRemaining(newRemaining);
          setTimeout(() => runBatch(next, newRemaining), 100);
        } else {
          setDropInFlight(false);
          setBatchRemaining(0);
        }
      });
    };

    runBatch(round, batchSize);
  }, [round, anim, dropInFlight, batchRemaining, selectedDropMode, doOneDrop]);

  const handleCashout = useCallback(async () => {
    if (!round || anim.running || dropInFlight || round.status !== "playing") return;
    setDropInFlight(true);
    try {
      const res = await fetch(`/api/plinko/${round.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cashout", playerToken: tokenRef.current }),
      });
      const data = await res.json() as RoundResponse;
      if (!res.ok) {
        console.error("[Plinko] Cashout error:", (data as any).error);
      } else {
        setRound(data);
      }
    } catch (err) {
      console.error("[Plinko] Cashout fetch error:", err);
    }
    setDropInFlight(false);
  }, [round, anim, dropInFlight]);

  const resetGame = useCallback(() => {
    setRound(null); setWatchingPayment(false); setPlayerProfile(null);
    setDropInFlight(false);
    anim.reset();
  }, [anim]);

  if (restoring) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-ink/30" /></div>;

  const isFinished = round && round.status !== "playing";
  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const ballCount = Math.floor(selectedTotal / selectedBallValue);

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>📌</div>
          <div>
            <h1 className="text-xl font-bold text-ink">{table.title}</h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {!round && (
        <div className="space-y-6">
          <BetSelector
            totalOptions={table.betOptions as number[]}
            selectedTotal={selectedTotal}
            selectedBallValue={selectedBallValue}
            selectedDropMode={selectedDropMode}
            onTotalChange={setSelectedTotal}
            onBallValueChange={setSelectedBallValue}
            onDropModeChange={setSelectedDropMode}
            accentColor={accentColor}
            locale={locale}
          />

          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4">
            <p className="text-xs text-ink/40 text-center mb-3 uppercase tracking-widest">{t.multiplier[locale]}s</p>
            <div className="flex gap-1 justify-center flex-wrap">
              {MULTIPLIERS.map((m, i) => (
                <span key={i} className="text-[10px] font-bold px-1.5 py-1 rounded"
                  style={{ backgroundColor: getBucketColor(m) + "25", color: getBucketColor(m) }}>{m}x</span>
              ))}
            </div>
          </div>

          {validCombo && (
            <ChancePayment
              recipientAddress={table.recipientAddress}
              amountCrc={selectedTotal}
              gameType="plinko"
              gameId={table.slug}
              accentColor={accentColor}
              payLabel={`Plinko — ${ballCount} ${ballCount === 1 ? t.ball[locale] : t.balls[locale]} × ${selectedBallValue} CRC`}
              onPaymentInitiated={async () => { await scanForRound(); setWatchingPayment(true); }}
              onScan={scanForRound} scanning={scanning}
              paymentStatus={watchingPayment ? "watching" : "idle"}
              playerToken={tokenRef.current}
              ballValue={selectedBallValue}
            />
          )}
        </div>
      )}

      {round && !isFinished && (
        <div className="space-y-4">
          <PlinkoBoard
            balls={round.balls}
            flyingBallPath={anim.flyingPath}
            animStep={anim.animStep}
            animSub={anim.animSub}
            accentColor={accentColor}
          />

          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.ballsRemaining[locale]}</p>
              <p className="text-xl font-bold text-ink">{round.ballsRemaining} / {round.ballCount}</p>
            </div>
            <div>
              <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.accumulated[locale]}</p>
              <p className="text-xl font-bold" style={{ color: accentColor }}>{round.accumulatedPayout.toFixed(2)} CRC</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleCashout} disabled={anim.running || dropInFlight || batchRemaining > 0}
              className="py-4 rounded-xl font-bold text-base bg-ink/5 dark:bg-white/10 text-ink hover:bg-ink/10 disabled:opacity-30">
              {t.cashout[locale]} {round.cashoutAmount.toFixed(2)}
            </button>
            <button onClick={handleDrop} disabled={anim.running || dropInFlight || batchRemaining > 0 || round.ballsRemaining === 0}
              className="py-4 rounded-xl font-bold text-base text-white hover:opacity-90 disabled:opacity-30"
              style={{ backgroundColor: accentColor }}>
              📌 {selectedDropMode === "all" ? t.dropAll[locale] : selectedDropMode === 1 ? t.dropOne[locale] : `×${selectedDropMode}`}
            </button>
          </div>
        </div>
      )}

      {round && isFinished && (
        <div>
          <PlinkoBoard balls={round.balls} flyingBallPath={null} animStep={-1} animSub={0} accentColor={accentColor} />
          <ResultPanel
            round={round}
            accentColor={accentColor}
            locale={locale}
            playerName={playerProfile?.name || (round.playerAddress ? shortenAddress(round.playerAddress) : undefined)}
            playerAvatar={playerProfile?.imageUrl || undefined}
            onPlayAgain={resetGame}
          />
        </div>
      )}
    </div>
  );
}
