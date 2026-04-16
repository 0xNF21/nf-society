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
  createInitialState, dropBall, getVisibleState, calculatePayout,
} from "@/lib/plinko";
import type { VisibleState } from "@/lib/plinko";

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
  if (multiplier >= 15) return "#EF4444";     // red — high risk/reward
  if (multiplier >= 5) return "#F97316";      // orange
  if (multiplier >= 2) return "#EAB308";      // yellow
  if (multiplier >= 1) return "#22C55E";      // green — safe
  if (multiplier >= 0.5) return "#3B82F6";    // blue — small loss
  return "#6366F1";                            // indigo — bigger loss
}

// ── Plinko Board (SVG animation) ──────────────────────

function PlinkoBoard({
  ballPath,
  animating,
  animStep,
  finalBucket,
  accentColor,
}: {
  ballPath: number[] | null;
  animating: boolean;
  animStep: number;
  finalBucket: number | null;
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

  // Calculate peg positions — each row i has (i + 2) pegs
  // But standard Plinko: row 0 has 3 pegs, row 1 has 4, ... row 11 has 14
  // Actually simpler: row i has (i + 1) gaps where ball can go, so (i + 2) pegs
  // But for the classic triangle: row i has (i + 1) pegs
  // We'll use: row i has (i + 3) pegs to keep it dense enough visually
  const getPegX = (row: number, col: number) => {
    const pegsInRow = row + 3;
    const spacing = svgW / (pegsInRow + 1);
    return spacing * (col + 1);
  };

  const getPegY = (row: number) => topPad + row * rowH;

  // Ball position at a given step
  const getBallPos = (step: number) => {
    if (!ballPath || step < 0) return { x: svgW / 2, y: topPad - 15 };
    if (step >= rows) {
      // In the bucket
      const bucketIdx = ballPath.reduce((s, d) => s + d, 0);
      const bucketW = svgW / BUCKET_COUNT;
      return { x: bucketW * bucketIdx + bucketW / 2, y: svgH - botPad + 20 };
    }
    // At peg row `step`, shifted by cumulative path
    const cumRight = ballPath.slice(0, step + 1).reduce((s, d) => s + d, 0);
    const pegsInRow = step + 3;
    const spacing = svgW / (pegsInRow + 1);
    // Ball position: between col cumRight and cumRight + 1
    const col = cumRight;
    const x = spacing * (col + 1) + spacing * ballPath[step] * 0.5;
    const y = getPegY(step) + rowH * 0.5;
    return { x, y };
  };

  const ballPos = animating ? getBallPos(animStep) : ballPath ? getBallPos(rows) : getBallPos(-1);

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

        {/* Buckets */}
        {MULTIPLIERS.map((mult, i) => {
          const bucketW = svgW / BUCKET_COUNT;
          const x = bucketW * i;
          const y = svgH - botPad + 5;
          const isActive = finalBucket === i && !animating;
          const color = getBucketColor(mult);
          return (
            <g key={`bucket-${i}`}>
              <rect
                x={x + 2}
                y={y}
                width={bucketW - 4}
                height={30}
                rx={6}
                fill={color}
                opacity={isActive ? 1 : 0.25}
                className="transition-opacity duration-300"
              />
              <text
                x={x + bucketW / 2}
                y={y + 18}
                textAnchor="middle"
                fontSize={mult >= 10 ? 8 : 9}
                fontWeight="bold"
                fill="white"
                opacity={isActive ? 1 : 0.7}
              >
                {mult}x
              </text>
            </g>
          );
        })}

        {/* Ball */}
        {(animating || ballPath) && (
          <circle
            cx={ballPos.x}
            cy={ballPos.y}
            r={ballR}
            fill={accentColor}
            className="transition-all duration-100"
            style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}
          />
        )}
      </svg>
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
  const t = translations.plinko;
  const won = round.status === "won";
  const payout = round.payoutCrc || 0;
  const multiplier = round.finalMultiplier || 0;

  return (
    <div className="space-y-4">
      {/* Result card */}
      <div className={`rounded-2xl p-6 text-center ${
        won
          ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
          : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
      }`}>
        <p className="text-4xl mb-2">{won ? "🎉" : "😔"}</p>
        <p className={`text-4xl font-black mb-2 ${won ? "text-emerald-600" : "text-red-500"}`}>
          x{multiplier}
        </p>
        <p className="font-bold text-lg text-ink">
          {won ? t.youWin[locale] : t.youLose[locale]}
        </p>
        <p className="text-sm text-ink/60 mt-1">
          {t.bucket[locale]} {round.finalBucket} | {t.multiplier[locale]} x{multiplier}
        </p>
        {payout > 0 && (
          <p className={`text-lg font-bold mt-2 ${won ? "text-emerald-600" : "text-amber-600"}`}>
            {won ? "+" : ""}{payout.toFixed(0)} CRC
          </p>
        )}
      </div>

      <PnlCard
        gameType="plinko"
        result={won ? "win" : "loss"}
        betCrc={round.betCrc}
        gainCrc={won ? Math.round(payout - round.betCrc) : -round.betCrc}
        playerName={playerName || "Player"}
        playerAvatar={playerAvatar}
        stats={`${t.bucket[locale]} ${round.finalBucket} | x${multiplier}`}
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

// ── Drop Animation ──────────────────────────────────

function DroppingAnimation({ accentColor, locale }: { accentColor: string; locale: "fr" | "en" }) {
  const [dots, setDots] = useState("");

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 300);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="text-center py-4">
      <p className="text-lg font-bold" style={{ color: accentColor }}>
        {translations.plinko.dropping[locale]}{dots}
      </p>
    </div>
  );
}

// ── Demo Game (client-only, no payment) ──────────────

function DemoPlinkoGame({ table }: { table: PlinkoTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.plinko;

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [result, setResult] = useState<RoundResponse | null>(null);
  const [ballPath, setBallPath] = useState<number[] | null>(null);
  const [animating, setAnimating] = useState(false);
  const [animStep, setAnimStep] = useState(-1);
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const betOptions = table.betOptions as number[];

  const handleDrop = useCallback(() => {
    if (animating) return;

    // Create and immediately resolve the game (client-side)
    const state = createInitialState(selectedBet);
    const resolved = dropBall(state);
    const path = resolved.ballPath!;

    setBallPath(path);
    setAnimating(true);
    setAnimStep(-1);

    // Animate step by step
    let step = 0;
    const animate = () => {
      setAnimStep(step);
      step++;
      if (step <= PEG_ROWS) {
        animRef.current = setTimeout(animate, 120);
      } else {
        // Animation done — show result
        setTimeout(() => {
          const payout = calculatePayout(resolved);
          setResult({
            status: resolved.status,
            betCrc: selectedBet,
            ballPath: resolved.ballPath,
            finalBucket: resolved.finalBucket,
            finalMultiplier: resolved.finalMultiplier,
            payoutCrc: payout,
            id: 0,
            tableId: 0,
            playerAddress: "",
            outcome: resolved.status === "won" ? "win" : "loss",
            payoutStatus: resolved.status === "won" ? "success" : "none",
            createdAt: new Date().toISOString(),
          });
          setAnimating(false);
        }, 400);
      }
    };
    animRef.current = setTimeout(animate, 200);
  }, [animating, selectedBet]);

  const resetGame = useCallback(() => {
    setResult(null);
    setBallPath(null);
    setAnimating(false);
    setAnimStep(-1);
    if (animRef.current) clearTimeout(animRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (animRef.current) clearTimeout(animRef.current);
    };
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
            📌
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">
              {table.title} <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">DEMO</span>
            </h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Bet selection — before drop */}
      {!result && !animating && !ballPath && (
        <div className="space-y-6">
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

          {/* Multiplier preview */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4">
            <p className="text-xs text-ink/40 text-center mb-3 uppercase tracking-widest">{t.multiplier[locale]}s</p>
            <div className="flex gap-1 justify-center flex-wrap">
              {MULTIPLIERS.map((m, i) => (
                <span
                  key={i}
                  className="text-[10px] font-bold px-1.5 py-1 rounded"
                  style={{ backgroundColor: getBucketColor(m) + "25", color: getBucketColor(m) }}
                >
                  {m}x
                </span>
              ))}
            </div>
          </div>

          {/* Empty board preview */}
          <PlinkoBoard ballPath={null} animating={false} animStep={-1} finalBucket={null} accentColor={accentColor} />

          <button
            onClick={handleDrop}
            className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
            style={{ backgroundColor: accentColor }}
          >
            📌 {t.drop[locale]} — {selectedBet} CRC (Demo)
          </button>
        </div>
      )}

      {/* Animating — board + dropping text */}
      {(animating || (ballPath && !result)) && (
        <div>
          <PlinkoBoard
            ballPath={ballPath}
            animating={animating}
            animStep={animStep}
            finalBucket={result?.finalBucket ?? null}
            accentColor={accentColor}
          />
          {animating && <DroppingAnimation accentColor={accentColor} locale={locale} />}
        </div>
      )}

      {/* Result */}
      {result && !animating && (
        <div>
          <PlinkoBoard
            ballPath={result.ballPath}
            animating={false}
            animStep={PEG_ROWS}
            finalBucket={result.finalBucket}
            accentColor={accentColor}
          />
          <ResultPanel
            round={result}
            accentColor={accentColor}
            locale={locale}
            onPlayAgain={resetGame}
          />
        </div>
      )}
    </div>
  );
}

// ── Main export (switches demo / real) ──────────────────

export default function PlinkoPageClient({ table }: { table: PlinkoTable }) {
  const { isDemo } = useDemo();
  if (isDemo) return <DemoPlinkoGame table={table} />;
  return <RealPlinkoGame table={table} />;
}

// ── Real Game (with blockchain payment) ──────────────────

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
  const [animating, setAnimating] = useState(false);
  const [animStep, setAnimStep] = useState(-1);
  const [ballPath, setBallPath] = useState<number[] | null>(null);
  const [playerProfile, setPlayerProfile] = useState<{ name?: string; imageUrl?: string | null } | null>(null);
  const [restoring, setRestoring] = useState(true);
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const betOptions = table.betOptions as number[];

  // Restore active round on mount
  useEffect(() => {
    if (!tokenRef.current) { setRestoring(false); return; }
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/plinko/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
        const data = await res.json();
        if (data.round && active) {
          setRound(data.round);
        }
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

  // Scan for payment
  const scanForRound = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`/api/plinko-scan?tableSlug=${table.slug}`, { method: "POST" });

      const activeRes = await fetch(`/api/plinko/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
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

  // Handle drop action (calls server)
  const handleDrop = useCallback(async () => {
    if (!round || animating || round.status !== "playing") return;
    setAnimating(true);
    setAnimStep(-1);

    try {
      const res = await fetch(`/api/plinko/${round.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "drop", playerToken: tokenRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[Plinko] Action error:", data.error);
        setAnimating(false);
        return;
      }

      // Animate the ball path
      const path = data.ballPath as number[];
      setBallPath(path);

      let step = 0;
      const animate = () => {
        setAnimStep(step);
        step++;
        if (step <= PEG_ROWS) {
          animRef.current = setTimeout(animate, 120);
        } else {
          setTimeout(() => {
            setRound(data);
            setAnimating(false);
          }, 400);
        }
      };
      animRef.current = setTimeout(animate, 200);
    } catch (err) {
      console.error("[Plinko] Action fetch error:", err);
      setAnimating(false);
    }
  }, [round, animating]);

  const resetGame = useCallback(() => {
    setRound(null);
    setWatchingPayment(false);
    setPlayerProfile(null);
    setAnimating(false);
    setAnimStep(-1);
    setBallPath(null);
    if (animRef.current) clearTimeout(animRef.current);
  }, []);

  useEffect(() => {
    return () => {
      if (animRef.current) clearTimeout(animRef.current);
    };
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
            📌
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

          {/* Multiplier preview */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4">
            <p className="text-xs text-ink/40 text-center mb-3 uppercase tracking-widest">{t.multiplier[locale]}s</p>
            <div className="flex gap-1 justify-center flex-wrap">
              {MULTIPLIERS.map((m, i) => (
                <span
                  key={i}
                  className="text-[10px] font-bold px-1.5 py-1 rounded"
                  style={{ backgroundColor: getBucketColor(m) + "25", color: getBucketColor(m) }}
                >
                  {m}x
                </span>
              ))}
            </div>
          </div>

          {/* Payment */}
          <ChancePayment
            recipientAddress={table.recipientAddress}
            amountCrc={selectedBet}
            gameType="plinko"
            gameId={table.slug}
            accentColor={accentColor}
            payLabel={`Plinko — ${selectedBet} CRC`}
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

      {/* During game — board + drop button */}
      {round && !isFinished && !animating && (
        <div>
          <PlinkoBoard ballPath={null} animating={false} animStep={-1} finalBucket={null} accentColor={accentColor} />
          <button
            onClick={handleDrop}
            className="w-full py-4 rounded-xl font-bold text-base text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
            style={{ backgroundColor: accentColor }}
          >
            📌 {t.drop[locale]} — {round.betCrc} CRC
          </button>
        </div>
      )}

      {/* Animating */}
      {animating && (
        <div>
          <PlinkoBoard
            ballPath={ballPath}
            animating={true}
            animStep={animStep}
            finalBucket={null}
            accentColor={accentColor}
          />
          <DroppingAnimation accentColor={accentColor} locale={locale} />
        </div>
      )}

      {/* After game — result */}
      {round && isFinished && !animating && (
        <div>
          <PlinkoBoard
            ballPath={round.ballPath}
            animating={false}
            animStep={PEG_ROWS}
            finalBucket={round.finalBucket}
            accentColor={accentColor}
          />
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
