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

// ── Plinko Board (multi-ball SVG) ──────────────────────

function PlinkoBoard({
  balls,
  currentBallIdx,
  animStep,
  animating,
  accentColor,
}: {
  balls: BallResult[];
  currentBallIdx: number;
  animStep: number;
  animating: boolean;
  accentColor: string;
}) {
  const rows = PEG_ROWS;
  const svgW = 340;
  const svgH = 400;
  const pegR = 4;
  const ballR = 7;
  const topPad = 30;
  const botPad = 55;
  const rowH = (svgH - topPad - botPad) / rows;

  const getPegX = (row: number, col: number) => {
    const pegsInRow = row + 3;
    const spacing = svgW / (pegsInRow + 1);
    return spacing * (col + 1);
  };
  const getPegY = (row: number) => topPad + row * rowH;

  const getBallPos = (path: number[], step: number) => {
    if (step < 0) return { x: svgW / 2, y: topPad - 15 };
    if (step >= rows) {
      const bucketIdx = path.reduce((s, d) => s + d, 0);
      const bucketW = svgW / BUCKET_COUNT;
      return { x: bucketW * bucketIdx + bucketW / 2, y: svgH - botPad + 20 };
    }
    const cumRight = path.slice(0, step + 1).reduce((s, d) => s + d, 0);
    const pegsInRow = step + 3;
    const spacing = svgW / (pegsInRow + 1);
    const x = spacing * (cumRight + 1) + spacing * path[step] * 0.5;
    const y = getPegY(step) + rowH * 0.5;
    return { x, y };
  };

  // Count balls per bucket (only finished balls)
  const finishedBalls = balls.slice(0, animating ? currentBallIdx : balls.length);
  const bucketCounts: number[] = Array(BUCKET_COUNT).fill(0);
  for (const b of finishedBalls) bucketCounts[b.bucket]++;

  // Current animating ball
  const currentBall = animating && currentBallIdx < balls.length ? balls[currentBallIdx] : null;
  const currentPos = currentBall ? getBallPos(currentBall.path, animStep) : null;

  return (
    <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4 mb-4">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full max-w-[340px] mx-auto" style={{ overflow: "visible" }}>
        {/* Pegs */}
        {Array.from({ length: rows }, (_, row) => {
          const pegsInRow = row + 3;
          return Array.from({ length: pegsInRow }, (_, col) => (
            <circle
              key={`peg-${row}-${col}`}
              cx={getPegX(row, col)}
              cy={getPegY(row)}
              r={pegR}
              className="fill-ink/20 dark:fill-white/20"
            />
          ));
        })}

        {/* Buckets with counts */}
        {MULTIPLIERS.map((mult, i) => {
          const bucketW = svgW / BUCKET_COUNT;
          const x = bucketW * i;
          const y = svgH - botPad + 5;
          const count = bucketCounts[i];
          const isActive = count > 0;
          const color = getBucketColor(mult);
          return (
            <g key={`bucket-${i}`}>
              <rect
                x={x + 2} y={y} width={bucketW - 4} height={30} rx={6}
                fill={color} opacity={isActive ? 1 : 0.25}
                className="transition-opacity duration-300"
              />
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

        {/* Current animating ball */}
        {currentPos && (
          <circle cx={currentPos.x} cy={currentPos.y} r={ballR}
            fill={accentColor} className="transition-all duration-75"
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}
          />
        )}
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

// ── Multi-ball animation hook ──────────────────────────

function useMultiBallAnimation(balls: BallResult[], onComplete: () => void) {
  const [currentBallIdx, setCurrentBallIdx] = useState(0);
  const [animStep, setAnimStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const start = useCallback(() => {
    if (balls.length === 0) return;
    setCurrentBallIdx(0);
    setAnimStep(-1);
    setRunning(true);
  }, [balls.length]);

  useEffect(() => {
    if (!running || balls.length === 0) return;

    let ballIdx = 0;
    let step = -1;

    const animateStep = () => {
      step++;
      setAnimStep(step);

      if (step <= PEG_ROWS) {
        timerRef.current = setTimeout(animateStep, 80);
      } else {
        ballIdx++;
        setCurrentBallIdx(ballIdx);
        if (ballIdx < balls.length) {
          step = -1;
          setAnimStep(-1);
          timerRef.current = setTimeout(animateStep, 150);
        } else {
          setTimeout(() => { setRunning(false); onCompleteRef.current(); }, 400);
        }
      }
    };

    timerRef.current = setTimeout(animateStep, 200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [running, balls]);

  const reset = useCallback(() => {
    setCurrentBallIdx(0); setAnimStep(-1); setRunning(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { currentBallIdx, animStep, running, start, reset };
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
