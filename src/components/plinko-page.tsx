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
  createInitialState, dropAllBalls, calculatePayout,
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

// ── Bucket color helpers ──────────────────────────────

function getBucketColor(multiplier: number): string {
  if (multiplier >= 15) return "#EF4444";
  if (multiplier >= 5) return "#F97316";
  if (multiplier >= 2) return "#EAB308";
  if (multiplier >= 1) return "#22C55E";
  if (multiplier >= 0.5) return "#3B82F6";
  return "#6366F1";
}

// ── Plinko Board (multi-ball SVG, physics-like) ──────────

/** In-flight ball state tracked by the animation system */
type FlyingBall = {
  ballIdx: number;
  step: number;         // current discrete row (-1 = not started, PEG_ROWS = landed)
  subProgress: number;  // 0..1 between current and next row
};

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

/** Smooth ball position with sub-step interpolation + wobble */
function getSmoothBallPos(path: number[], step: number, sub: number): { x: number; y: number } {
  if (step < 0) {
    // Dropping in from top
    const targetY = getPegY(0);
    return { x: SVG_W / 2, y: TOP_PAD - 15 + sub * (targetY - TOP_PAD + 15) * 0.5 };
  }
  if (step >= PEG_ROWS) {
    // In bucket
    const bucketIdx = path.reduce((s, d) => s + d, 0);
    const bucketW = SVG_W / BUCKET_COUNT;
    return { x: bucketW * bucketIdx + bucketW / 2, y: SVG_H - BOT_PAD + 20 };
  }

  const cumRight = path.slice(0, step + 1).reduce((s, d) => s + d, 0);
  const pegsInRow = step + 3;
  const spacing = SVG_W / (pegsInRow + 1);

  // Current position (at this peg)
  const curX = spacing * (cumRight + 1) + spacing * path[step] * 0.4;
  const curY = getPegY(step) + ROW_H * 0.4;

  // Next position
  let nextX: number, nextY: number;
  if (step + 1 >= PEG_ROWS) {
    const bucketIdx = path.reduce((s, d) => s + d, 0);
    const bucketW = SVG_W / BUCKET_COUNT;
    nextX = bucketW * bucketIdx + bucketW / 2;
    nextY = SVG_H - BOT_PAD + 20;
  } else {
    const nextCumRight = path.slice(0, step + 2).reduce((s, d) => s + d, 0);
    const nextPegsInRow = step + 4;
    const nextSpacing = SVG_W / (nextPegsInRow + 1);
    nextX = nextSpacing * (nextCumRight + 1) + nextSpacing * path[step + 1] * 0.4;
    nextY = getPegY(step + 1) + ROW_H * 0.4;
  }

  // Ease-in interpolation (gravity: accelerate downward)
  const eased = sub * sub; // quadratic ease-in
  const x = curX + (nextX - curX) * eased;
  const y = curY + (nextY - curY) * eased;

  // Add slight random wobble based on step for organic feel
  const wobble = Math.sin(step * 7.3 + sub * 12) * 2;

  return { x: x + wobble, y };
}

function PlinkoBoard({
  balls,
  flyingBalls,
  finishedCount,
  accentColor,
}: {
  balls: BallResult[];
  flyingBalls: FlyingBall[];
  finishedCount: number;
  accentColor: string;
}) {
  // Count balls per bucket (finished balls only)
  const finished = balls.slice(0, finishedCount);
  const bucketCounts: number[] = Array(BUCKET_COUNT).fill(0);
  for (const b of finished) bucketCounts[b.bucket]++;

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

        {/* Buckets with counts */}
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

        {/* All flying balls (multiple in flight at once!) */}
        {flyingBalls.map((fb) => {
          const ball = balls[fb.ballIdx];
          if (!ball) return null;
          const pos = getSmoothBallPos(ball.path, fb.step, fb.subProgress);
          // Slight size variation and opacity for depth
          const scale = 0.85 + fb.subProgress * 0.15;
          return (
            <circle key={`fly-${fb.ballIdx}`}
              cx={pos.x} cy={pos.y} r={BALL_R * scale}
              fill={accentColor} opacity={0.9}
              style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}
            />
          );
        })}
      </svg>
    </div>
  );
}

// ── Running total during animation ──────────────────────

function RunningTotal({
  balls, currentBallIdx, ballCount, accentColor, locale,
}: {
  balls: BallResult[]; currentBallIdx: number; ballCount: number;
  accentColor: string; locale: "fr" | "en";
}) {
  const t = translations.plinko;
  const finished = balls.slice(0, currentBallIdx);
  const runningGain = Math.floor(finished.reduce((s, b) => s + b.multiplier, 0) * 100) / 100;

  return (
    <div className="text-center py-3 space-y-1">
      <p className="text-sm text-ink/50">
        {t.balls[locale]} {currentBallIdx}/{ballCount}
      </p>
      <p className="text-2xl font-black tabular-nums" style={{ color: accentColor }}>
        {runningGain.toFixed(2)} CRC
      </p>
      <p className="text-xs text-ink/30">{t.dropping[locale]}</p>
    </div>
  );
}

// ── Result Panel ──────────────────────────────────────

function ResultPanel({
  round, accentColor, locale, playerName, playerAvatar, onPlayAgain,
}: {
  round: RoundResponse; accentColor: string; locale: "fr" | "en";
  playerName?: string; playerAvatar?: string; onPlayAgain: () => void;
}) {
  const t = translations.plinko;
  const won = round.status === "won";
  const payout = round.payoutCrc || 0;
  const totalMult = round.totalMultiplier || 0;
  const net = payout - round.betCrc;

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl p-6 text-center ${
        won ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
          : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
      }`}>
        <p className="text-4xl mb-2">{won ? "🎉" : "😔"}</p>
        <p className={`text-4xl font-black mb-2 ${won ? "text-emerald-600" : "text-red-500"}`}>
          {payout.toFixed(2)} CRC
        </p>
        <p className="font-bold text-lg text-ink">
          {won ? t.youWin[locale] : t.youLose[locale]}
        </p>
        <p className="text-sm text-ink/60 mt-1">
          {round.ballCount} {t.balls[locale]} | {t.totalGain[locale]}: x{totalMult.toFixed(2)}
        </p>
        <p className={`text-sm font-bold mt-1 ${net >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {net >= 0 ? "+" : ""}{net.toFixed(2)} CRC net
        </p>
      </div>

      <PnlCard gameType="plinko" result={won ? "win" : "loss"} betCrc={round.betCrc}
        gainCrc={Math.round(net * 1000) / 1000} playerName={playerName || "Player"} playerAvatar={playerAvatar}
        stats={`${round.ballCount} ${t.balls[locale]} | ${payout.toFixed(2)} CRC`}
        date={new Date().toLocaleDateString()} locale={locale} />

      <button onClick={onPlayAgain}
        className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90"
        style={{ backgroundColor: accentColor }}>
        {t.playAgain[locale]}
      </button>
    </div>
  );
}

// ── Multi-ball animation with overlapping flight + gravity ──

/** Time (ms) for a ball to traverse one peg row. Accelerates with gravity. */
function rowDuration(row: number): number {
  // Row 0 ≈ 110ms, row 11 ≈ 55ms (gravity acceleration)
  return 110 - row * 5;
}

/** Delay before launching ball i (staggered, overlapping) */
function launchDelay(i: number, total: number): number {
  if (total <= 1) return 0;
  // 1-5 balls: 350ms apart. 10+: 200ms apart. 25+: 120ms apart
  const gap = total <= 5 ? 350 : total <= 10 ? 200 : 120;
  return i * gap;
}

type AnimState = {
  flyingBalls: FlyingBall[];
  finishedCount: number;
};

function useMultiBallAnimation(balls: BallResult[], onComplete: () => void) {
  const [animState, setAnimState] = useState<AnimState>({ flyingBalls: [], finishedCount: 0 });
  const [running, setRunning] = useState(false);
  const rafRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const start = useCallback(() => {
    if (balls.length === 0) return;
    setAnimState({ flyingBalls: [], finishedCount: 0 });
    setRunning(true);
  }, [balls.length]);

  useEffect(() => {
    if (!running || balls.length === 0) return;

    const startTime = performance.now();
    const total = balls.length;

    // Per-ball tracking
    const ballStart: number[] = []; // ms when each ball starts
    const ballStep: number[] = [];  // current discrete step
    const ballSub: number[] = [];   // sub-progress within step
    const ballDone: boolean[] = [];
    for (let i = 0; i < total; i++) {
      ballStart.push(launchDelay(i, total));
      ballStep.push(-1);
      ballSub.push(0);
      ballDone.push(false);
    }

    let lastFinished = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const flying: FlyingBall[] = [];
      let finished = 0;

      for (let i = 0; i < total; i++) {
        if (ballDone[i]) { finished++; continue; }

        const ballElapsed = elapsed - ballStart[i];
        if (ballElapsed < 0) continue; // not launched yet

        // Calculate which row the ball is at based on cumulative row durations
        let cumTime = 0;
        let step = -1;
        let sub = 0;

        // Step -1 → 0: entry drop (~120ms)
        const entryDur = 120;
        if (ballElapsed < entryDur) {
          step = -1;
          sub = ballElapsed / entryDur;
        } else {
          let t = ballElapsed - entryDur;
          for (let r = 0; r <= PEG_ROWS; r++) {
            const dur = rowDuration(r);
            if (t < dur) {
              step = r;
              sub = t / dur;
              break;
            }
            t -= dur;
            if (r === PEG_ROWS) {
              // Ball has landed
              step = PEG_ROWS;
              sub = 1;
            }
          }
          if (step === -1) { step = PEG_ROWS; sub = 1; } // fallback
        }

        if (step >= PEG_ROWS) {
          ballDone[i] = true;
          finished++;
        } else {
          flying.push({ ballIdx: i, step, subProgress: sub });
        }
      }

      setAnimState({ flyingBalls: flying, finishedCount: finished });

      if (finished < total) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // All done — brief pause then complete
        setTimeout(() => { setRunning(false); onCompleteRef.current(); }, 300);
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [running, balls]);

  const reset = useCallback(() => {
    setAnimState({ flyingBalls: [], finishedCount: 0 });
    setRunning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return { ...animState, running, start, reset };
}

// ── Demo Game ──────────────────────────────────────

function DemoPlinkoGame({ table }: { table: PlinkoTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.plinko;

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [result, setResult] = useState<RoundResponse | null>(null);
  const [resolvedBalls, setResolvedBalls] = useState<BallResult[]>([]);

  const handleAnimComplete = useCallback(() => {
    if (resolvedBalls.length === 0) return;
    const totalMult = Math.round(resolvedBalls.reduce((s, b) => s + b.multiplier, 0) * 10000) / 10000;
    const payout = Math.floor(totalMult * 100) / 100;
    const won = payout >= selectedBet;
    setResult({
      status: won ? "won" : "lost", betCrc: selectedBet, ballCount: selectedBet,
      balls: resolvedBalls, totalMultiplier: totalMult, payoutCrc: payout,
      id: 0, tableId: 0, playerAddress: "", outcome: won ? "win" : "loss",
      payoutStatus: won ? "success" : "none", createdAt: new Date().toISOString(),
    });
  }, [resolvedBalls, selectedBet]);

  const anim = useMultiBallAnimation(resolvedBalls, handleAnimComplete);

  const handleDrop = useCallback(() => {
    if (anim.running) return;
    const state = createInitialState(selectedBet);
    const resolved = dropAllBalls(state);
    setResolvedBalls(resolved.balls);
  }, [anim.running, selectedBet]);

  useEffect(() => {
    if (resolvedBalls.length > 0 && !anim.running && !result) anim.start();
  }, [resolvedBalls, anim.running, result]);

  const resetGame = useCallback(() => {
    setResult(null); setResolvedBalls([]); anim.reset();
  }, [anim]);

  const showBet = !result && !anim.running && resolvedBalls.length === 0;

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
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
            <div className="grid grid-cols-4 gap-3">
              {(table.betOptions as number[]).map((bet) => (
                <button key={bet} onClick={() => setSelectedBet(bet)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all ${selectedBet === bet ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"}`}
                  style={selectedBet === bet ? { backgroundColor: accentColor } : {}}>
                  {bet} {t.balls[locale]}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink/40 text-center">1 CRC {t.perBall[locale]}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4">
            <p className="text-xs text-ink/40 text-center mb-3 uppercase tracking-widest">{t.multiplier[locale]}s</p>
            <div className="flex gap-1 justify-center flex-wrap">
              {MULTIPLIERS.map((m, i) => (
                <span key={i} className="text-[10px] font-bold px-1.5 py-1 rounded"
                  style={{ backgroundColor: getBucketColor(m) + "25", color: getBucketColor(m) }}>{m}x</span>
              ))}
            </div>
          </div>
          <PlinkoBoard balls={[]} currentBallIdx={0} animStep={-1} animating={false} accentColor={accentColor} />
          <button onClick={handleDrop}
            className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
            style={{ backgroundColor: accentColor }}>
            📌 {t.drop[locale]} {selectedBet} {t.balls[locale]} — {selectedBet} CRC (Demo)
          </button>
        </div>
      )}

      {anim.running && (
        <div>
          <PlinkoBoard balls={resolvedBalls} currentBallIdx={anim.currentBallIdx} animStep={anim.animStep} animating={true} accentColor={accentColor} />
          <RunningTotal balls={resolvedBalls} currentBallIdx={anim.currentBallIdx} ballCount={selectedBet} accentColor={accentColor} locale={locale} />
        </div>
      )}

      {result && !anim.running && (
        <div>
          <PlinkoBoard balls={result.balls} currentBallIdx={result.balls.length} animStep={PEG_ROWS + 1} animating={false} accentColor={accentColor} />
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

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [round, setRound] = useState<RoundResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [serverBalls, setServerBalls] = useState<BallResult[]>([]);
  const [serverData, setServerData] = useState<RoundResponse | null>(null);
  const [playerProfile, setPlayerProfile] = useState<{ name?: string; imageUrl?: string | null } | null>(null);
  const [restoring, setRestoring] = useState(true);

  const handleAnimComplete = useCallback(() => {
    if (serverData) { setRound(serverData); setServerData(null); }
  }, [serverData]);

  const anim = useMultiBallAnimation(serverBalls, handleAnimComplete);

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

  useEffect(() => {
    if (round || restoring) return;
    const ms = watchingPayment ? 5000 : 15000;
    const interval = setInterval(scanForRound, ms);
    return () => clearInterval(interval);
  }, [round, restoring, watchingPayment, scanForRound]);

  const handleDrop = useCallback(async () => {
    if (!round || anim.running || round.status !== "playing") return;
    try {
      const res = await fetch(`/api/plinko/${round.id}/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drop", playerToken: tokenRef.current }),
      });
      const data = await res.json();
      if (!res.ok) { console.error("[Plinko] Action error:", data.error); return; }
      const balls = (data.balls || []) as BallResult[];
      setServerData(data);
      setServerBalls(balls);
    } catch (err) { console.error("[Plinko] Action fetch error:", err); }
  }, [round, anim.running]);

  useEffect(() => {
    if (serverBalls.length > 0 && !anim.running && serverData) anim.start();
  }, [serverBalls]);

  const resetGame = useCallback(() => {
    setRound(null); setWatchingPayment(false); setPlayerProfile(null);
    setServerBalls([]); setServerData(null); anim.reset();
  }, [anim]);

  if (restoring) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-ink/30" /></div>;

  const isFinished = round && round.status !== "playing";
  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

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
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
            <div className="grid grid-cols-4 gap-3">
              {(table.betOptions as number[]).map((bet) => (
                <button key={bet} onClick={() => setSelectedBet(bet)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all ${selectedBet === bet ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"}`}
                  style={selectedBet === bet ? { backgroundColor: accentColor } : {}}>
                  {bet} {t.balls[locale]}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink/40 text-center">1 CRC {t.perBall[locale]}</p>
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4">
            <p className="text-xs text-ink/40 text-center mb-3 uppercase tracking-widest">{t.multiplier[locale]}s</p>
            <div className="flex gap-1 justify-center flex-wrap">
              {MULTIPLIERS.map((m, i) => (
                <span key={i} className="text-[10px] font-bold px-1.5 py-1 rounded"
                  style={{ backgroundColor: getBucketColor(m) + "25", color: getBucketColor(m) }}>{m}x</span>
              ))}
            </div>
          </div>
          <ChancePayment recipientAddress={table.recipientAddress} amountCrc={selectedBet}
            gameType="plinko" gameId={table.slug} accentColor={accentColor}
            payLabel={`Plinko — ${selectedBet} ${t.balls[locale]} (${selectedBet} CRC)`}
            onPaymentInitiated={async () => { await scanForRound(); setWatchingPayment(true); }}
            onScan={scanForRound} scanning={scanning}
            paymentStatus={watchingPayment ? "watching" : "idle"} playerToken={tokenRef.current} />
        </div>
      )}

      {round && !isFinished && !anim.running && (
        <div>
          <PlinkoBoard balls={[]} currentBallIdx={0} animStep={-1} animating={false} accentColor={accentColor} />
          <button onClick={handleDrop}
            className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
            style={{ backgroundColor: accentColor }}>
            📌 {t.drop[locale]} {round.ballCount} {t.balls[locale]} — {round.betCrc} CRC
          </button>
        </div>
      )}

      {anim.running && (
        <div>
          <PlinkoBoard balls={serverBalls} currentBallIdx={anim.currentBallIdx} animStep={anim.animStep} animating={true} accentColor={accentColor} />
          <RunningTotal balls={serverBalls} currentBallIdx={anim.currentBallIdx} ballCount={serverBalls.length} accentColor={accentColor} locale={locale} />
        </div>
      )}

      {round && isFinished && !anim.running && (
        <div>
          <PlinkoBoard balls={round.balls || []} currentBallIdx={(round.balls || []).length} animStep={PEG_ROWS + 1} animating={false} accentColor={accentColor} />
          <ResultPanel round={round} accentColor={accentColor} locale={locale}
            playerName={playerProfile?.name || (round.playerAddress ? shortenAddress(round.playerAddress) : undefined)}
            playerAvatar={playerProfile?.imageUrl || undefined} onPlayAgain={resetGame} />
        </div>
      )}
    </div>
  );
}
