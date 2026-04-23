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
import { DemoBalancePayButton } from "@/components/demo-balance-pay-button";
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

// ── Plinko Board (multi-ball concurrent) ──────────────

type FlyingBall = { id: number; path: number[]; step: number; sub: number };

function PlinkoBoard({
  settledBalls,
  flyingBalls,
  accentColor,
}: {
  /** balls that have landed and should show as counts in buckets */
  settledBalls: BallResult[];
  /** balls currently in the air, each at its own animation position */
  flyingBalls: FlyingBall[];
  accentColor: string;
}) {
  const bucketCounts: number[] = Array(BUCKET_COUNT).fill(0);
  for (const b of settledBalls) bucketCounts[b.bucket]++;

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

        {/* All flying balls */}
        {flyingBalls.map((fb) => {
          const pos = getSmoothBallPos(fb.path, fb.step, fb.sub);
          return (
            <circle key={`fly-${fb.id}`} cx={pos.x} cy={pos.y} r={BALL_R}
              fill={accentColor} opacity={0.9}
              style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ── Concurrent multi-ball animation hook ────────────
// Each launch adds a ball to `flyingBalls`. Multiple can be in flight simultaneously.
// `onLand` is called per ball when it reaches the bucket, so callers can finalize
// the ball in their state.

const ENTRY_DUR = 160;
const ROW_DUR = (r: number) => 150 - r * 6;
const TOTAL_DUR = ENTRY_DUR + Array.from({ length: PEG_ROWS }, (_, r) => ROW_DUR(r)).reduce((s, d) => s + d, 0);
const LINGER_DUR = 200; // keep ball visible in bucket briefly after landing

type InternalBall = { id: number; path: number[]; launchedAt: number; onLand: () => void; landed: boolean };

function useConcurrentBallAnim() {
  const [flyingBalls, setFlyingBalls] = useState<FlyingBall[]>([]);
  const ballsRef = useRef<InternalBall[]>([]);
  const rafRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextIdRef = useRef(0);

  const ensureLoop = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = setInterval(() => {
      const now = performance.now();
      const visible: FlyingBall[] = [];
      const toLand: InternalBall[] = [];
      const still: InternalBall[] = [];

      for (const b of ballsRef.current) {
        const elapsed = now - b.launchedAt;

        // If fully elapsed + linger → remove
        if (elapsed >= TOTAL_DUR + LINGER_DUR) continue;

        // If just landed this frame (and not previously) → trigger onLand
        if (elapsed >= TOTAL_DUR && !b.landed) {
          b.landed = true;
          toLand.push(b);
        }

        // Compute position
        let step = -1;
        let sub = 0;
        if (elapsed < ENTRY_DUR) {
          step = -1;
          sub = elapsed / ENTRY_DUR;
        } else {
          step = PEG_ROWS;
          sub = 1;
          let t = elapsed - ENTRY_DUR;
          for (let r = 0; r < PEG_ROWS; r++) {
            const dur = ROW_DUR(r);
            if (t < dur) { step = r; sub = Math.min(t / dur, 1); break; }
            t -= dur;
          }
        }

        visible.push({ id: b.id, path: b.path, step, sub });
        still.push(b);
      }

      ballsRef.current = still;
      setFlyingBalls(visible);

      // Fire onLand callbacks AFTER state updates
      for (const b of toLand) b.onLand();

      if (ballsRef.current.length === 0) {
        if (rafRef.current) { clearInterval(rafRef.current); rafRef.current = null; }
      }
    }, 33);
  }, []);

  /** Launch a single ball with its path. `onLand` fires when it lands in its bucket. */
  const launch = useCallback((path: number[], onLand: () => void) => {
    const id = nextIdRef.current++;
    ballsRef.current.push({ id, path, launchedAt: performance.now(), onLand, landed: false });
    ensureLoop();
  }, [ensureLoop]);

  const reset = useCallback(() => {
    if (rafRef.current) { clearInterval(rafRef.current); rafRef.current = null; }
    ballsRef.current = [];
    setFlyingBalls([]);
  }, []);

  useEffect(() => () => { if (rafRef.current) clearInterval(rafRef.current); }, []);

  return { flyingBalls, running: flyingBalls.length > 0, launch, reset };
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

      <button onClick={onPlayAgain}
        className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90 flex items-center justify-center gap-2"
        style={{ backgroundColor: accentColor }}>
        <RefreshCw className="w-4 h-4" />
        {t.playAgain[locale]}
      </button>

      <PnlCard gameType="plinko" result={won ? "win" : "loss"} betCrc={round.totalBet}
        gainCrc={Math.round(net)} playerName={playerName || "Player"} playerAvatar={playerAvatar}
        stats={`${round.balls.length}/${round.ballCount} ${t.balls[locale]} | ${payout.toFixed(2)} CRC`}
        date={new Date().toLocaleDateString()} locale={locale} />
    </div>
  );
}

// ── Bet Selector ──────────────────────────────────────

function BetSelector({
  totalOptions, selectedTotal, selectedBallValue,
  onTotalChange, onBallValueChange,
  accentColor, locale,
}: {
  totalOptions: number[]; selectedTotal: number; selectedBallValue: number;
  onTotalChange: (v: number) => void; onBallValueChange: (v: number) => void;
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

// ── Drop Mode Selector (during game) ───────────────────

function DropModeSelector({
  selectedDropMode, onDropModeChange, accentColor, locale, disabled,
}: {
  selectedDropMode: DropMode;
  onDropModeChange: (m: DropMode) => void;
  accentColor: string;
  locale: "fr" | "en";
  disabled?: boolean;
}) {
  const t = translations.plinko;
  return (
    <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-3">
      <p className="text-[10px] text-ink/40 uppercase tracking-widest text-center mb-2">{t.dropMode[locale]}</p>
      <div className="grid grid-cols-4 gap-2">
        {DROP_MODES.map((m) => {
          const label = m === "all" ? t.dropAll[locale] : `×${m}`;
          return (
            <button key={String(m)} onClick={() => onDropModeChange(m)} disabled={disabled}
              className={`py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-30 ${
                selectedDropMode === m ? "text-white shadow" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
              }`}
              style={selectedDropMode === m ? { backgroundColor: accentColor } : {}}>
              {label}
            </button>
          );
        })}
      </div>
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
  // Committed state = balls that have landed (for bucket counters + cashout calc)
  const [state, setState] = useState<ReturnType<typeof createInitialState> | null>(null);
  // In-flight count = balls currently animating OR queued but not yet landed
  const [inFlightCount, setInFlightCount] = useState(0);
  // Queued count = balls scheduled but not yet launched (can be cancelled by stop)
  const [queuedCount, setQueuedCount] = useState(0);
  const [result, setResult] = useState<RoundResponse | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const anim = useConcurrentBallAnim();
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const validCombo = selectedTotal % selectedBallValue === 0;

  // Keep ball value valid when total changes
  useEffect(() => {
    if (selectedTotal % selectedBallValue !== 0) {
      const validBVs = BALL_VALUE_OPTIONS.filter((v) => selectedTotal % v === 0 && v <= selectedTotal);
      if (validBVs.length > 0) setSelectedBallValue(validBVs[0]);
    }
  }, [selectedTotal, selectedBallValue]);

  const handleStart = useCallback((total: number = selectedTotal) => {
    if (total % selectedBallValue !== 0) return;
    setState(createInitialState(total, selectedBallValue));
    setResult(null);
    setInFlightCount(0);
    setQueuedCount(0);
    pendingTimeoutsRef.current.forEach(clearTimeout);
    pendingTimeoutsRef.current = [];
    anim.reset();
  }, [selectedTotal, selectedBallValue, anim]);

  const handleDrop = useCallback(() => {
    if (!state || state.status !== "playing") return;
    const totalUsed = state.balls.length + inFlightCount;
    const ballsAvailable = state.ballCount - totalUsed;
    if (ballsAvailable <= 0) return;

    const batchSize = selectedDropMode === "all" ? ballsAvailable : Math.min(selectedDropMode, ballsAvailable);
    if (batchSize <= 0) return;

    // Generate all ball paths up front (so we know their landing positions)
    // We use the same logic as the server: random paths
    const newBalls: BallResult[] = [];
    for (let i = 0; i < batchSize; i++) {
      const path: number[] = [];
      for (let j = 0; j < PEG_ROWS; j++) {
        path.push(Math.random() < 0.5 ? 0 : 1);
      }
      const bucket = path.reduce((s, d) => s + d, 0);
      newBalls.push({ path, bucket, multiplier: MULTIPLIERS[bucket] });
    }

    setInFlightCount((c) => c + batchSize);
    setQueuedCount((c) => c + batchSize);

    // Launch each ball with slight stagger for better visual effect
    newBalls.forEach((ball, idx) => {
      const tid = setTimeout(() => {
        pendingTimeoutsRef.current = pendingTimeoutsRef.current.filter((t) => t !== tid);
        setQueuedCount((c) => Math.max(c - 1, 0));
        anim.launch(ball.path, () => {
          // When ball lands: commit it to state
          setState((prev) => {
            if (!prev) return prev;
            const committed = { ...prev, balls: [...prev.balls, ball] };
            committed.accumulatedPayout = Math.round((prev.accumulatedPayout + prev.ballValue * ball.multiplier) * 100) / 100;
            const isLast = committed.balls.length >= committed.ballCount;
            if (isLast) committed.status = "finished";
            return committed;
          });
          setInFlightCount((c) => c - 1);
        });
      }, idx * 120); // 120ms stagger between balls in same batch
      pendingTimeoutsRef.current.push(tid);
    });
  }, [state, inFlightCount, selectedDropMode, anim]);

  // Stop the cadence: cancel queued (not-yet-launched) balls. In-flight balls keep
  // falling and commit normally. Cancelled balls stay available for a future drop.
  const handleStop = useCallback(() => {
    const cancelled = pendingTimeoutsRef.current.length;
    pendingTimeoutsRef.current.forEach(clearTimeout);
    pendingTimeoutsRef.current = [];
    if (cancelled > 0) {
      setInFlightCount((c) => Math.max(c - cancelled, 0));
      setQueuedCount(0);
    }
  }, []);

  // Auto-finalize result when game status becomes "finished" and no balls in flight
  useEffect(() => {
    if (!state || result) return;
    if (state.status === "finished" && inFlightCount === 0) {
      setResult({
        status: state.status,
        totalBet: state.totalBet,
        ballValue: state.ballValue,
        ballCount: state.ballCount,
        ballsRemaining: 0,
        balls: state.balls,
        accumulatedPayout: state.accumulatedPayout,
        cashoutAmount: 0,
        finalPayout: calculatePayout(state),
        id: 0, tableId: 0, playerAddress: "",
        outcome: "win",
        payoutCrc: calculatePayout(state),
        payoutStatus: "success",
        createdAt: new Date().toISOString(),
      });
    }
  }, [state, inFlightCount, result]);

  const handleCashout = useCallback(() => {
    if (!state || state.status !== "playing" || inFlightCount > 0) return;
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
  }, [state, inFlightCount]);

  const resetGame = useCallback(() => {
    setState(null);
    setResult(null);
    setInFlightCount(0);
    anim.reset();
  }, [anim]);

  const showBet = !state && !result;
  const showGame = state && state.status === "playing" && !result;
  const showResult = result;

  const cashoutAmount = state ? calculateCashoutAmount(state) : 0;
  const ballsLeft = state ? state.ballCount - state.balls.length : 0;
  const ballsAvailable = state ? state.ballCount - state.balls.length - inFlightCount : 0;

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <div className="mb-6">
        <Link
          href="/chance"
          onClick={(e) => {
            if (showResult) {
              e.preventDefault();
              resetGame();
            }
          }}
          className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4"
        >
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
            onTotalChange={setSelectedTotal}
            onBallValueChange={setSelectedBallValue}
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

          <PlinkoBoard settledBalls={[]} flyingBalls={[]} accentColor={accentColor} />

          <button onClick={() => handleStart()} disabled={!validCombo}
            className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2"
            style={{ backgroundColor: accentColor }}>
            📌 {selectedTotal} CRC (Demo)
          </button>
        </div>
      )}

      {showGame && state && (
        <div className="space-y-4">
          <PlinkoBoard
            settledBalls={state.balls}
            flyingBalls={anim.flyingBalls}
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

          <DropModeSelector
            selectedDropMode={selectedDropMode}
            onDropModeChange={setSelectedDropMode}
            accentColor={accentColor}
            locale={locale}
          />

          <div className="grid grid-cols-2 gap-3">
            {queuedCount > 0 ? (
              <button onClick={handleStop}
                className="col-span-2 py-4 rounded-xl font-bold text-base bg-red-500 text-white hover:bg-red-600">
                ⏹ {t.stop[locale]}
              </button>
            ) : (
              <>
                <button onClick={handleCashout} disabled={inFlightCount > 0}
                  className="py-4 rounded-xl font-bold text-base bg-ink/5 dark:bg-white/10 text-ink hover:bg-ink/10 disabled:opacity-30">
                  {t.cashout[locale]} {cashoutAmount.toFixed(2)}
                </button>
                <button onClick={handleDrop} disabled={ballsAvailable === 0}
                  className="py-4 rounded-xl font-bold text-base text-white hover:opacity-90 disabled:opacity-30"
                  style={{ backgroundColor: accentColor }}>
                  📌 {selectedDropMode === "all" ? t.dropAll[locale] : selectedDropMode === 1 ? t.dropOne[locale] : `×${selectedDropMode}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showResult && result && (
        <div>
          <PlinkoBoard settledBalls={result.balls} flyingBalls={[]} accentColor={accentColor} />
          <ResultPanel round={result} accentColor={accentColor} locale={locale} onPlayAgain={() => setShowReplay(true)} />
        </div>
      )}

      {/* Quick replay modal (demo) */}
      <QuickReplayModal
        open={showReplay}
        onClose={() => setShowReplay(false)}
        betOptions={table.betOptions as number[]}
        currentBet={selectedTotal}
        onBetChange={setSelectedTotal}
        accentColor={accentColor}
      >
        <DemoBalancePayButton
          amountCrc={selectedTotal}
          accentColor={accentColor}
          onPaid={() => {
            setShowReplay(false);
            handleStart(selectedTotal);
          }}
        />
      </QuickReplayModal>
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
  const [serverInFlight, setServerInFlight] = useState(false); // waiting for HTTP response
  // Balls returned by server but not yet landed visually — they are NOT shown in settledBalls yet
  const [pendingBalls, setPendingBalls] = useState<BallResult[]>([]);
  // True while a drop sequence is auto-dropping (looping server requests) — cancellable via stop
  const [dropping, setDropping] = useState(false);
  const [showReplay, setShowReplay] = useState(false);
  const anim = useConcurrentBallAnim();
  const dropControllerRef = useRef<{ cancelled: boolean } | null>(null);

  const validCombo = selectedTotal % selectedBallValue === 0;

  // Keep ball value valid
  useEffect(() => {
    if (selectedTotal % selectedBallValue !== 0) {
      const validBVs = BALL_VALUE_OPTIONS.filter((v) => selectedTotal % v === 0 && v <= selectedTotal);
      if (validBVs.length > 0) setSelectedBallValue(validBVs[0]);
    }
  }, [selectedTotal, selectedBallValue]);

  // Restore active round — re-runs when token becomes available after SSR hydration
  const tokenValue = tokenRef.current;
  useEffect(() => {
    if (!tokenValue) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/plinko/active?tableSlug=${table.slug}&token=${tokenValue}`);
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
  }, [table.slug, tokenRef]);

  // Poll scan
  useEffect(() => {
    if (round || restoring) return;
    const ms = watchingPayment ? 5000 : 15000;
    const interval = setInterval(scanForRound, ms);
    return () => clearInterval(interval);
  }, [round, restoring, watchingPayment, scanForRound]);

  // Drop N balls: loop server requests one-by-one with stagger, so stop can cancel mid-sequence.
  // Each request commits 1 ball server-side; cancelled balls never reach the server.
  const handleDrop = useCallback(async () => {
    if (!round || dropping || round.status !== "playing") return;
    const ballsAvailable = round.ballsRemaining - pendingBalls.length;
    if (ballsAvailable <= 0) return;
    const batchSize = selectedDropMode === "all" ? ballsAvailable : Math.min(selectedDropMode, ballsAvailable);
    if (batchSize <= 0) return;

    const controller = { cancelled: false };
    dropControllerRef.current = controller;
    setDropping(true);

    for (let i = 0; i < batchSize; i++) {
      if (controller.cancelled) break;
      try {
        const res = await fetch(`/api/plinko/${round.id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "drop", count: 1, playerToken: tokenRef.current }),
        });
        const data = await res.json() as RoundResponse;
        if (!res.ok) {
          console.error("[Plinko] Drop error:", (data as any).error);
          break;
        }
        if (controller.cancelled) break;

        const newBall = data.balls[data.balls.length - 1];
        setPendingBalls((prev) => [...prev, newBall]);

        anim.launch(newBall.path, () => {
          setRound((prev) => {
            if (!prev) return prev;
            const newBalls = [...prev.balls, newBall];
            const newAcc = Math.round((prev.accumulatedPayout + prev.ballValue * newBall.multiplier) * 100) / 100;
            const newRemaining = prev.ballsRemaining - 1;
            return {
              ...prev,
              balls: newBalls,
              accumulatedPayout: newAcc,
              ballsRemaining: newRemaining,
              cashoutAmount: Math.round((newRemaining * prev.ballValue + newAcc) * 100) / 100,
              status: data.status,
              finalPayout: data.finalPayout,
              outcome: data.outcome,
              payoutCrc: data.payoutCrc,
              payoutStatus: data.payoutStatus,
            };
          });
          setPendingBalls((prev) => prev.filter((b) => b !== newBall));
        });

        if (i < batchSize - 1) {
          await new Promise((r) => setTimeout(r, 120));
        }
      } catch (err) {
        console.error("[Plinko] Drop fetch error:", err);
        break;
      }
    }

    dropControllerRef.current = null;
    setDropping(false);
  }, [round, dropping, pendingBalls, selectedDropMode, anim, tokenRef]);

  // Stop the cadence: cancel the drop loop. Balls already sent to the server keep their
  // in-flight animation and commit normally. Balls not yet sent never reach the server.
  const handleStop = useCallback(() => {
    if (dropControllerRef.current) dropControllerRef.current.cancelled = true;
  }, []);

  const handleCashout = useCallback(async () => {
    if (!round || serverInFlight || pendingBalls.length > 0 || anim.running || round.status !== "playing") return;
    setServerInFlight(true);
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
    setServerInFlight(false);
  }, [round, serverInFlight, pendingBalls, anim, tokenRef]);

  const resetGame = useCallback(() => {
    if (dropControllerRef.current) dropControllerRef.current.cancelled = true;
    dropControllerRef.current = null;
    setDropping(false);
    setRound(null); setWatchingPayment(false); setPlayerProfile(null);
    setServerInFlight(false);
    setPendingBalls([]);
    anim.reset();
  }, [anim]);

  if (restoring) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-ink/30" /></div>;

  const isFinished = round && round.status !== "playing";
  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const ballCount = Math.floor(selectedTotal / selectedBallValue);

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <div className="mb-6">
        <Link
          href="/chance"
          onClick={(e) => {
            if (isFinished) {
              e.preventDefault();
              resetGame();
            }
          }}
          className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4"
        >
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
            onTotalChange={setSelectedTotal}
            onBallValueChange={setSelectedBallValue}
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
            settledBalls={round.balls}
            flyingBalls={anim.flyingBalls}
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

          <DropModeSelector
            selectedDropMode={selectedDropMode}
            onDropModeChange={setSelectedDropMode}
            accentColor={accentColor}
            locale={locale}
          />

          <div className="grid grid-cols-2 gap-3">
            {dropping ? (
              <button onClick={handleStop}
                className="col-span-2 py-4 rounded-xl font-bold text-base bg-red-500 text-white hover:bg-red-600">
                ⏹ {t.stop[locale]}
              </button>
            ) : (
              <>
                <button onClick={handleCashout} disabled={serverInFlight || pendingBalls.length > 0 || anim.running}
                  className="py-4 rounded-xl font-bold text-base bg-ink/5 dark:bg-white/10 text-ink hover:bg-ink/10 disabled:opacity-30">
                  {t.cashout[locale]} {round.cashoutAmount.toFixed(2)}
                </button>
                <button onClick={handleDrop} disabled={serverInFlight || (round.ballsRemaining - pendingBalls.length) <= 0}
                  className="py-4 rounded-xl font-bold text-base text-white hover:opacity-90 disabled:opacity-30"
                  style={{ backgroundColor: accentColor }}>
                  📌 {selectedDropMode === "all" ? t.dropAll[locale] : selectedDropMode === 1 ? t.dropOne[locale] : `×${selectedDropMode}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {round && isFinished && (
        <div>
          <PlinkoBoard settledBalls={round.balls} flyingBalls={[]} accentColor={accentColor} />
          <ResultPanel
            round={round}
            accentColor={accentColor}
            locale={locale}
            playerName={playerProfile?.name || (round.playerAddress ? shortenAddress(round.playerAddress) : undefined)}
            playerAvatar={playerProfile?.imageUrl || undefined}
            onPlayAgain={() => setShowReplay(true)}
          />
        </div>
      )}

      {/* Quick replay modal */}
      <QuickReplayModal
        open={showReplay}
        onClose={() => setShowReplay(false)}
        betOptions={table.betOptions as number[]}
        currentBet={selectedTotal}
        onBetChange={setSelectedTotal}
        accentColor={accentColor}
      >
        {validCombo && (
          <ChancePayment
            recipientAddress={table.recipientAddress}
            amountCrc={selectedTotal}
            gameType="plinko"
            gameId={table.slug}
            accentColor={accentColor}
            payLabel={`Plinko — ${ballCount} ${ballCount === 1 ? t.ball[locale] : t.balls[locale]} × ${selectedBallValue} CRC`}
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
            ballValue={selectedBallValue}
          />
        )}
      </QuickReplayModal>
    </div>
  );
}
