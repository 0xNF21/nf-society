"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2, Shuffle, ChevronDown, ChevronUp } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { ChancePayment } from "@/components/chance-payment";
import { PnlCard } from "@/components/pnl-card";
import { usePlayerToken } from "@/hooks/use-player-token";
import { darkSafeColor } from "@/lib/utils";
import {
  GRID_SIZE, DRAW_COUNT, MAX_PICKS,
  generateDraws, createInitialState, resolveDraw,
  getVisibleState, getPayTableRow, calculateMultiplier,
} from "@/lib/keno";
import type { VisibleState } from "@/lib/keno";

type KenoTable = {
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

// ── Keno Grid ──────────────────────────────────────────

function KenoGrid({
  picks,
  draws,
  hits,
  onToggle,
  disabled,
  maxPicks,
  accentColor,
  animatingIndex,
}: {
  picks: Set<number>;
  draws: number[];
  hits: number[];
  onToggle: (n: number) => void;
  disabled: boolean;
  maxPicks: number;
  accentColor: string;
  animatingIndex: number; // -1 = no animation, 0..9 = current draw index
}) {
  const drawSet = new Set(draws.slice(0, animatingIndex >= 0 ? animatingIndex + 1 : draws.length));
  const hitSet = new Set(hits);
  const isDrawn = draws.length > 0;

  return (
    <div className="grid grid-cols-8 gap-1.5">
      {Array.from({ length: GRID_SIZE }, (_, i) => i + 1).map((n) => {
        const isPicked = picks.has(n);
        const isHit = isDrawn && hitSet.has(n) && drawSet.has(n);
        const isDraw = isDrawn && drawSet.has(n);
        const isMiss = isDrawn && isPicked && drawSet.has(n) && !hitSet.has(n);

        let bg = "bg-ink/5 dark:bg-white/5";
        let text = "text-ink/60";
        let border = "border-transparent";
        let scale = "";

        if (isHit) {
          bg = "bg-emerald-500";
          text = "text-white";
          border = "border-emerald-400";
          scale = "scale-110";
        } else if (isMiss) {
          bg = "bg-red-500/20 dark:bg-red-500/30";
          text = "text-red-400 line-through";
          border = "border-red-300 dark:border-red-600";
        } else if (isDraw && !isPicked) {
          bg = "bg-ink/10 dark:bg-white/10";
          text = "text-ink/40";
          border = "border-ink/20 dark:border-white/20";
        } else if (isPicked) {
          bg = "";
          text = "text-white";
          border = "";
        }

        return (
          <button
            key={n}
            onClick={() => onToggle(n)}
            disabled={disabled || isDrawn || (!isPicked && picks.size >= maxPicks)}
            className={`aspect-square rounded-lg border text-sm font-bold transition-all duration-200 ${bg} ${text} ${border} ${scale}
              ${!disabled && !isDrawn && !isPicked && picks.size < maxPicks ? "hover:bg-ink/10 dark:hover:bg-white/10 active:scale-95" : ""}
              ${!disabled && !isDrawn && isPicked ? "hover:opacity-80 active:scale-95" : ""}
              disabled:cursor-default
            `}
            style={
              isPicked && !isHit && !isMiss && !isDraw
                ? { backgroundColor: accentColor, borderColor: accentColor }
                : undefined
            }
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

// ── Pay Table Display ──────────────────────────────────

function PayTableDisplay({
  pickCount,
  betCrc,
  accentColor,
  locale,
}: {
  pickCount: number;
  betCrc: number;
  accentColor: string;
  locale: "fr" | "en";
}) {
  const t = translations.keno;
  const [open, setOpen] = useState(false);
  const rows = getPayTableRow(pickCount);
  const winRows = rows.filter((r) => r.multiplier > 0);

  if (pickCount === 0 || winRows.length === 0) return null;

  return (
    <div className="rounded-xl border border-ink/10 bg-white/60 dark:bg-white/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-ink/60 hover:bg-ink/5 dark:hover:bg-white/5 transition-colors"
      >
        <span>{t.payTable[locale]}</span>
        {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>
      {open && (
        <div className="px-4 pb-3 space-y-1">
          {winRows.map((row) => (
            <div key={row.hits} className="flex items-center justify-between text-sm">
              <span className="text-ink/60">
                {row.hits} {t.hits[locale]}
              </span>
              <span className="font-bold" style={{ color: accentColor }}>
                x{row.multiplier.toFixed(2)} → {Math.round(betCrc * row.multiplier * 1000) / 1000} CRC
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Drawing Animation ──────────────────────────────────

function DrawingAnimation({
  draws,
  picks,
  onAnimIndex,
  onComplete,
  accentColor,
}: {
  draws: number[];
  picks: Set<number>;
  onAnimIndex: (idx: number) => void;
  onComplete: () => void;
  accentColor: string;
}) {
  const [currentIndex, setCurrentIndex] = useState(-1);
  const completedRef = useRef(false);

  useEffect(() => {
    if (draws.length === 0) return;

    let idx = 0;
    const timer = setInterval(() => {
      setCurrentIndex(idx);
      onAnimIndex(idx);
      idx++;
      if (idx >= draws.length) {
        clearInterval(timer);
        setTimeout(() => {
          if (!completedRef.current) {
            completedRef.current = true;
            onComplete();
          }
        }, 800);
      }
    }, 350);

    return () => clearInterval(timer);
  }, [draws, onAnimIndex, onComplete]);

  const revealed = draws.slice(0, currentIndex + 1);
  const hitSet = new Set(revealed.filter((d) => picks.has(d)));

  return (
    <div className="text-center py-4">
      <div className="flex flex-wrap justify-center gap-2 mb-4">
        {draws.map((d, i) => {
          const isRevealed = i <= currentIndex;
          const isHit = isRevealed && picks.has(d);
          return (
            <div
              key={i}
              className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all duration-300 ${
                !isRevealed
                  ? "bg-ink/10 dark:bg-white/10 text-ink/20 scale-90"
                  : isHit
                  ? "bg-emerald-500 text-white scale-110 shadow-lg"
                  : "bg-ink/20 dark:bg-white/15 text-ink/60 scale-100"
              }`}
              style={isHit ? { boxShadow: `0 0 12px ${accentColor}40` } : undefined}
            >
              {isRevealed ? d : "?"}
            </div>
          );
        })}
      </div>
      <p className="text-sm text-ink/40">
        {hitSet.size} / {picks.size} {translations.keno.hits[useLocale().locale]}
      </p>
    </div>
  );
}

// ── Result Panel ──────────────────────────────────────

function ResultPanel({
  visible,
  accentColor,
  locale,
  playerName,
  playerAvatar,
  onPlayAgain,
}: {
  visible: VisibleState | RoundResponse;
  accentColor: string;
  locale: "fr" | "en";
  playerName?: string;
  playerAvatar?: string;
  onPlayAgain: () => void;
}) {
  const t = translations.keno;
  const won = visible.status === "won";
  const payout = visible.payoutCrc || 0;
  const multiplier = visible.multiplier || 0;

  return (
    <div className="space-y-4">
      {/* Result banner */}
      <div className={`rounded-2xl p-6 text-center ${
        won
          ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
          : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
      }`}>
        <p className="text-4xl mb-2">{won ? "🎱" : "💀"}</p>
        <p className={`text-2xl font-black mb-1 ${won ? "text-emerald-600" : "text-red-500"}`}>
          {won ? t.youWin[locale] : t.youLose[locale]}
        </p>
        <p className="text-sm text-ink/60">
          {visible.hits.length}/{visible.pickCount} {t.hits[locale]}
          {multiplier > 0 && ` — x${multiplier.toFixed(2)}`}
        </p>
        {won && payout > 0 && (
          <p className="text-lg text-emerald-600 font-bold mt-2">+{Math.round(payout * 1000) / 1000} CRC</p>
        )}
      </div>

      {/* Final grid (show all draws) */}
      <KenoGrid
        picks={new Set(visible.picks)}
        draws={visible.draws}
        hits={visible.hits}
        onToggle={() => {}}
        disabled={true}
        maxPicks={visible.pickCount}
        accentColor={accentColor}
        animatingIndex={-1}
      />

      <PnlCard
        gameType="keno"
        result={won ? "win" : "loss"}
        betCrc={visible.betCrc}
        gainCrc={won ? Math.round((payout - visible.betCrc) * 1000) / 1000 : -visible.betCrc}
        playerName={playerName || "Player"}
        playerAvatar={playerAvatar}
        stats={`${visible.hits.length}/${visible.pickCount} ${t.hits[locale]} — x${(multiplier || 0).toFixed(2)}`}
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

// ── Demo Game (client-only, no payment) ──────────────

function DemoKenoGame({ table }: { table: KenoTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.keno;

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [picks, setPicks] = useState<Set<number>>(new Set());
  const [pickCount, setPickCount] = useState(5);
  const [result, setResult] = useState<VisibleState | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawData, setDrawData] = useState<{ draws: number[]; picks: Set<number> } | null>(null);
  const [animIdx, setAnimIdx] = useState(-1);
  const resultRef = useRef<VisibleState | null>(null);

  const betOptions = table.betOptions as number[];

  const togglePick = useCallback((n: number) => {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(n)) {
        next.delete(n);
      } else if (next.size < pickCount) {
        next.add(n);
      }
      return next;
    });
  }, [pickCount]);

  const autoSelect = useCallback(() => {
    const selected = new Set<number>();
    while (selected.size < pickCount) {
      selected.add(Math.floor(Math.random() * GRID_SIZE) + 1);
    }
    setPicks(selected);
  }, [pickCount]);

  const onAnimComplete = useCallback(() => {
    if (resultRef.current) {
      setResult(resultRef.current);
      setDrawing(false);
      setDrawData(null);
      setAnimIdx(-1);
    }
  }, []);

  const handleDraw = useCallback(() => {
    if (picks.size !== pickCount || drawing) return;
    setDrawing(true);
    setAnimIdx(-1);

    const picksArray = Array.from(picks);
    const state = createInitialState(selectedBet, pickCount);
    const finalState = resolveDraw(state, { type: "draw", picks: picksArray });
    const visible = getVisibleState(finalState);
    resultRef.current = visible;

    // Start animation
    setDrawData({ draws: visible.draws, picks });
  }, [picks, pickCount, drawing, selectedBet]);

  const resetGame = useCallback(() => {
    setResult(null);
    setPicks(new Set());
    setDrawData(null);
    setDrawing(false);
    setAnimIdx(-1);
    resultRef.current = null;
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
            🎱
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">
              {table.title} <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">DEMO</span>
            </h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Before draw */}
      {!result && !drawing && (
        <div className="space-y-4">
          {/* Bet selection */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-5 space-y-3">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
            <div className="grid grid-cols-4 gap-3">
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

          {/* Pick count selector */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.pickNumbers[locale]}</h2>
              <span className="text-xs text-ink/40">{t.maxPicks[locale].replace("{max}", String(MAX_PICKS))}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: MAX_PICKS }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => { setPickCount(n); setPicks(new Set()); }}
                  className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                    pickCount === n ? "text-white" : "bg-ink/5 dark:bg-white/5 text-ink/50 hover:bg-ink/10"
                  }`}
                  style={pickCount === n ? { backgroundColor: accentColor } : {}}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Grid + controls */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-ink/40">
                {t.picksCount[locale].replace("{n}", String(picks.size))} / {pickCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPicks(new Set())}
                  className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink/60"
                >
                  <Trash2 className="w-3 h-3" /> {t.clearPicks[locale]}
                </button>
                <button
                  onClick={autoSelect}
                  className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink/60"
                >
                  <Shuffle className="w-3 h-3" /> {t.autoSelect[locale]}
                </button>
              </div>
            </div>

            <KenoGrid
              picks={picks}
              draws={[]}
              hits={[]}
              onToggle={togglePick}
              disabled={false}
              maxPicks={pickCount}
              accentColor={accentColor}
              animatingIndex={-1}
            />
          </div>

          {/* Pay table */}
          <PayTableDisplay pickCount={pickCount} betCrc={selectedBet} accentColor={accentColor} locale={locale} />

          {/* Draw button */}
          <button
            onClick={handleDraw}
            disabled={picks.size !== pickCount}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            style={{ backgroundColor: accentColor }}
          >
            🎱 {t.draw[locale]} — {selectedBet} CRC / {pickCount} {t.picks[locale]} (Demo)
          </button>
        </div>
      )}

      {/* Drawing animation */}
      {drawing && drawData && (
        <div className="space-y-4">
          <KenoGrid
            picks={drawData.picks}
            draws={drawData.draws}
            hits={drawData.draws.filter((d) => drawData.picks.has(d))}
            onToggle={() => {}}
            disabled={true}
            maxPicks={pickCount}
            accentColor={accentColor}
            animatingIndex={animIdx}
          />
          <DrawingAnimation
            draws={drawData.draws}
            picks={drawData.picks}
            onAnimIndex={setAnimIdx}
            onComplete={onAnimComplete}
            accentColor={accentColor}
          />
        </div>
      )}

      {/* Result */}
      {result && !drawing && (
        <ResultPanel
          visible={result}
          accentColor={accentColor}
          locale={locale}
          onPlayAgain={resetGame}
        />
      )}
    </div>
  );
}

// ── Main export (switches demo / real) ──────────────────

export default function KenoPageClient({ table }: { table: KenoTable }) {
  const { isDemo } = useDemo();
  if (isDemo) return <DemoKenoGame table={table} />;
  return <RealKenoGame table={table} />;
}

// ── Real Game (with blockchain payment) ──────────────────

function RealKenoGame({ table }: { table: KenoTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.keno;
  const tokenRef = usePlayerToken("keno", table.slug);

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [picks, setPicks] = useState<Set<number>>(new Set());
  const [pickCount, setPickCount] = useState(5);
  const [round, setRound] = useState<RoundResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [drawData, setDrawData] = useState<{ draws: number[]; picks: Set<number> } | null>(null);
  const [animIdx, setAnimIdx] = useState(-1);
  const [playerProfile, setPlayerProfile] = useState<{ name?: string; imageUrl?: string | null } | null>(null);
  const [restoring, setRestoring] = useState(true);
  const pendingRoundRef = useRef<RoundResponse | null>(null);

  const betOptions = table.betOptions as number[];

  // Restore active round on mount — re-runs when token becomes available after SSR hydration
  const tokenValue = tokenRef.current;
  useEffect(() => {
    if (!tokenValue) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/keno/active?tableSlug=${table.slug}&token=${tokenValue}`);
        const data = await res.json();
        if (data.round && active) {
          setRound(data.round);
          setPickCount(data.round.pickCount);
        }
      } catch {}
      if (active) setRestoring(false);
    })();
    return () => { active = false; };
  }, [table.slug, tokenValue]);

  // Fetch player profile when round established
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

  const gameId = `${table.slug}-${pickCount}`;

  // Scan for payment
  const scanForRound = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`/api/keno-scan?tableSlug=${table.slug}`, { method: "POST" });
      const activeRes = await fetch(`/api/keno/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
      const activeData = await activeRes.json();
      if (activeData.round) {
        setWatchingPayment(false);
        setRound(activeData.round);
        setPickCount(activeData.round.pickCount);
      }
    } catch {}
    setScanning(false);
  }, [table.slug, tokenRef]);

  // Poll scan when watching payment
  useEffect(() => {
    if (round || restoring) return;
    const ms = watchingPayment ? 5000 : 15000;
    const interval = setInterval(scanForRound, ms);
    return () => clearInterval(interval);
  }, [round, restoring, watchingPayment, scanForRound]);

  const togglePick = useCallback((n: number) => {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(n)) {
        next.delete(n);
      } else if (next.size < pickCount) {
        next.add(n);
      }
      return next;
    });
  }, [pickCount]);

  const autoSelect = useCallback(() => {
    const selected = new Set<number>();
    while (selected.size < pickCount) {
      selected.add(Math.floor(Math.random() * GRID_SIZE) + 1);
    }
    setPicks(selected);
  }, [pickCount]);

  const onAnimComplete = useCallback(() => {
    if (pendingRoundRef.current) {
      setRound(pendingRoundRef.current);
      setDrawing(false);
      setDrawData(null);
      setAnimIdx(-1);
      pendingRoundRef.current = null;
    }
  }, []);

  // Submit picks and draw
  const handleDraw = useCallback(async () => {
    if (!round || picks.size !== round.pickCount || drawing) return;
    setDrawing(true);
    setAnimIdx(-1);

    try {
      const res = await fetch(`/api/keno/${round.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ picks: Array.from(picks), playerToken: tokenRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error(data.error);
        setDrawing(false);
        return;
      }

      // Store result, start animation — onAnimComplete will show result
      pendingRoundRef.current = data;
      setDrawData({ draws: data.draws, picks });
    } catch (err) {
      console.error(err);
      setDrawing(false);
    }
  }, [round, picks, drawing, tokenRef]);

  const resetGame = useCallback(() => {
    setRound(null);
    setPicks(new Set());
    setDrawData(null);
    setDrawing(false);
    setAnimIdx(-1);
    setPlayerProfile(null);
    pendingRoundRef.current = null;
  }, []);

  if (restoring) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink/30" />
      </div>
    );
  }

  const isFinished = round && round.status !== "playing";

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>
            🎱
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{table.title}</h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Before payment: bet + pick count + payment */}
      {!round && (
        <div className="space-y-4">
          {/* Bet selection */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-5 space-y-3">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
            <div className="grid grid-cols-4 gap-3">
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

          {/* Pick count */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.pickNumbers[locale]}</h2>
              <span className="text-xs text-ink/40">{t.maxPicks[locale].replace("{max}", String(MAX_PICKS))}</span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {Array.from({ length: MAX_PICKS }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => setPickCount(n)}
                  className={`w-9 h-9 rounded-lg text-sm font-bold transition-all ${
                    pickCount === n ? "text-white" : "bg-ink/5 dark:bg-white/5 text-ink/50 hover:bg-ink/10"
                  }`}
                  style={pickCount === n ? { backgroundColor: accentColor } : {}}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Pay table */}
          <PayTableDisplay pickCount={pickCount} betCrc={selectedBet} accentColor={accentColor} locale={locale} />

          {/* Payment */}
          <ChancePayment
            recipientAddress={table.recipientAddress}
            amountCrc={selectedBet}
            gameType="keno"
            gameId={gameId}
            tableSlug={table.slug}
            accentColor={accentColor}
            payLabel={`🎱 Keno — ${selectedBet} CRC / ${pickCount} ${t.picks[locale]}`}
            onPaymentInitiated={async () => {
              await scanForRound();
              setWatchingPayment(true);
            }}
            onScan={scanForRound}
            scanning={scanning}
            paymentStatus={watchingPayment ? "watching" : "idle"}
            playerToken={tokenRef.current}
            balanceSlug={table.slug}
            balanceExtras={{ pickCount }}
          />
        </div>
      )}

      {/* After payment, before draw: pick numbers on grid */}
      {round && round.status === "playing" && !drawing && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-4 space-y-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-ink/40">
                {t.picksCount[locale].replace("{n}", String(picks.size))} / {round.pickCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPicks(new Set())}
                  className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink/60"
                >
                  <Trash2 className="w-3 h-3" /> {t.clearPicks[locale]}
                </button>
                <button
                  onClick={autoSelect}
                  className="flex items-center gap-1 text-xs text-ink/40 hover:text-ink/60"
                >
                  <Shuffle className="w-3 h-3" /> {t.autoSelect[locale]}
                </button>
              </div>
            </div>

            <KenoGrid
              picks={picks}
              draws={[]}
              hits={[]}
              onToggle={togglePick}
              disabled={false}
              maxPicks={round.pickCount}
              accentColor={accentColor}
              animatingIndex={-1}
            />
          </div>

          {/* Pay table */}
          <PayTableDisplay pickCount={round.pickCount} betCrc={round.betCrc} accentColor={accentColor} locale={locale} />

          {/* Draw button */}
          <button
            onClick={handleDraw}
            disabled={picks.size !== round.pickCount}
            className="w-full py-3.5 rounded-xl font-bold text-sm text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            style={{ backgroundColor: accentColor }}
          >
            🎱 {t.draw[locale]}
          </button>
        </div>
      )}

      {/* Drawing animation */}
      {drawing && drawData && (
        <div className="space-y-4">
          <KenoGrid
            picks={drawData.picks}
            draws={drawData.draws}
            hits={drawData.draws.filter((d) => drawData.picks.has(d))}
            onToggle={() => {}}
            disabled={true}
            maxPicks={pickCount}
            accentColor={accentColor}
            animatingIndex={animIdx}
          />
          <DrawingAnimation
            draws={drawData.draws}
            picks={drawData.picks}
            onAnimIndex={setAnimIdx}
            onComplete={onAnimComplete}
            accentColor={accentColor}
          />
        </div>
      )}

      {/* Result */}
      {isFinished && !drawing && (
        <ResultPanel
          visible={round as RoundResponse}
          accentColor={accentColor}
          locale={locale}
          playerName={playerProfile?.name || (round?.playerAddress ? `${round.playerAddress.slice(0, 6)}...` : undefined)}
          playerAvatar={playerProfile?.imageUrl || undefined}
          onPlayAgain={resetGame}
        />
      )}
    </div>
  );
}
