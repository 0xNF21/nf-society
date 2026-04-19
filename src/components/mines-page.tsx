"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Gem, Bomb, Banknote } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { ChancePayment } from "@/components/chance-payment";
import { PnlCard } from "@/components/pnl-card";
import { usePlayerToken } from "@/hooks/use-player-token";
import { encodeGameData } from "@/lib/game-data";
import { darkSafeColor } from "@/lib/utils";
import {
  createGrid, createInitialState, applyAction, getVisibleState,
  calculatePayout, calculateMultiplier,
} from "@/lib/mines";
import type { MinesState, VisibleState, VisibleCell } from "@/lib/mines";

type MinesTable = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  betOptions: number[];
  mineOptions: number[];
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

// ── Grid Cell Component ──────────────────────────────

function MineCell({
  cell,
  onClick,
  disabled,
  accentColor,
  gameOver,
}: {
  cell: VisibleCell;
  onClick: () => void;
  disabled: boolean;
  accentColor: string;
  gameOver: boolean;
}) {
  if (cell.state === "gem") {
    return (
      <button
        disabled
        className="aspect-square rounded-xl border-2 border-emerald-400/50 bg-emerald-500/10 flex items-center justify-center transition-all"
      >
        <Gem className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-400" />
      </button>
    );
  }

  if (cell.state === "mine") {
    const isExploded = cell.exploded;
    return (
      <button
        disabled
        className={`aspect-square rounded-xl border-2 flex items-center justify-center transition-all ${
          isExploded
            ? "border-red-500 bg-red-500/30 ring-2 ring-red-500 scale-110 z-10"
            : "border-red-400/30 bg-red-500/5"
        }`}
      >
        <Bomb className={`w-5 h-5 sm:w-6 sm:h-6 ${isExploded ? "text-red-500" : "text-red-400/60"}`} />
      </button>
    );
  }

  // Hidden cell
  return (
    <button
      onClick={onClick}
      disabled={disabled || gameOver}
      className="aspect-square rounded-xl border-2 border-ink/10 dark:border-white/10 bg-ink/5 dark:bg-white/5 flex items-center justify-center transition-all hover:border-ink/30 dark:hover:border-white/30 hover:bg-ink/10 dark:hover:bg-white/10 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
    >
      <span className="text-ink/20 dark:text-white/20 text-lg">?</span>
    </button>
  );
}

// ── Game Board ──────────────────────────────────────

function MinesBoard({
  visible,
  onReveal,
  onCashout,
  disabled,
  accentColor,
  locale,
}: {
  visible: VisibleState;
  onReveal: (cellIndex: number) => void;
  onCashout: () => void;
  disabled: boolean;
  accentColor: string;
  locale: "fr" | "en";
}) {
  const t = translations.mines;
  const gameOver = visible.status !== "playing";

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-center flex-1">
          <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.gemsFound[locale]}</p>
          <p className="text-lg font-bold text-emerald-500">{visible.gemsRevealed}/{visible.totalGems}</p>
        </div>
        <div className="text-center flex-1">
          <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.multiplier[locale]}</p>
          <p className="text-lg font-bold" style={{ color: accentColor }}>x{visible.currentMultiplier.toFixed(2)}</p>
        </div>
        {visible.status === "playing" && visible.nextMultiplier > 0 && (
          <div className="text-center flex-1">
            <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.nextMultiplier[locale]}</p>
            <p className="text-lg font-bold text-ink/60">x{visible.nextMultiplier.toFixed(2)}</p>
          </div>
        )}
      </div>

      {/* 5x5 Grid */}
      <div className="grid grid-cols-5 gap-2">
        {visible.cells.map((cell) => (
          <MineCell
            key={cell.index}
            cell={cell}
            onClick={() => onReveal(cell.index)}
            disabled={disabled}
            accentColor={accentColor}
            gameOver={gameOver}
          />
        ))}
      </div>

      {/* Cashout button */}
      {visible.canCashout && (
        <button
          onClick={onCashout}
          disabled={disabled}
          className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2 bg-amber-500 text-white"
        >
          <Banknote className="w-5 h-5" />
          {t.cashoutAmount[locale].replace("{amount}", String(Math.round(visible.potentialPayout * 1000) / 1000))}
        </button>
      )}

      {/* Tap hint */}
      {visible.status === "playing" && visible.gemsRevealed === 0 && (
        <p className="text-center text-xs text-ink/40">{t.tapToReveal[locale]}</p>
      )}
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
  visible: VisibleState;
  accentColor: string;
  locale: "fr" | "en";
  playerName?: string;
  playerAvatar?: string;
  onPlayAgain: () => void;
}) {
  const t = translations.mines;
  const won = visible.status === "cashed_out";
  const payout = won ? visible.potentialPayout : 0;

  return (
    <div className="space-y-4">
      {/* Final grid (all revealed) */}
      <div className="grid grid-cols-5 gap-2">
        {visible.cells.map((cell) => (
          <MineCell
            key={cell.index}
            cell={cell}
            onClick={() => {}}
            disabled
            accentColor={accentColor}
            gameOver
          />
        ))}
      </div>

      {/* Result banner */}
      <div className={`rounded-2xl p-5 text-center ${
        won
          ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
          : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
      }`}>
        <p className="text-3xl mb-1">{won ? "💎" : "💥"}</p>
        <p className="font-bold text-lg text-ink">
          {won ? t.youWin[locale] : t.youLose[locale]}
        </p>
        <p className="text-sm text-ink/60 mt-1">
          {t.gemsFound[locale]}: {visible.gemsRevealed} | x{visible.currentMultiplier.toFixed(2)}
        </p>
        {won && payout > 0 && (
          <p className="text-lg text-emerald-600 font-bold mt-2">+{Math.round(payout * 1000) / 1000} CRC</p>
        )}
      </div>

      <PnlCard
        gameType="mines"
        result={won ? "win" : "loss"}
        betCrc={visible.betCrc}
        gainCrc={won ? Math.round((payout - visible.betCrc) * 1000) / 1000 : -visible.betCrc}
        playerName={playerName || "Demo Player"}
        playerAvatar={playerAvatar}
        stats={`${t.gemsFound[locale]}: ${visible.gemsRevealed} | ${visible.mineCount} mines`}
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

function DemoMinesGame({ table }: { table: MinesTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.mines;

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [selectedMines, setSelectedMines] = useState<number>(table.mineOptions[1] || 3);
  const [gameState, setGameState] = useState<MinesState | null>(null);
  const [animating, setAnimating] = useState(false);

  const betOptions = table.betOptions as number[];
  const mineOptions = table.mineOptions as number[];

  const startGame = useCallback(() => {
    const grid = createGrid(selectedMines);
    const state = createInitialState(grid, selectedBet);
    setGameState(state);
  }, [selectedBet, selectedMines]);

  const handleReveal = useCallback((cellIndex: number) => {
    if (!gameState || animating) return;
    setAnimating(true);
    setTimeout(() => {
      try {
        const newState = applyAction(gameState, { type: "reveal", cellIndex });
        setGameState(newState);
      } catch {}
      setAnimating(false);
    }, 200);
  }, [gameState, animating]);

  const handleCashout = useCallback(() => {
    if (!gameState || animating) return;
    setAnimating(true);
    setTimeout(() => {
      try {
        const newState = applyAction(gameState, { type: "cashout" });
        setGameState(newState);
      } catch {}
      setAnimating(false);
    }, 100);
  }, [gameState, animating]);

  const resetGame = useCallback(() => {
    setGameState(null);
    setAnimating(false);
  }, []);

  const visible = gameState ? getVisibleState(gameState) : null;
  const isFinished = visible && visible.status !== "playing";

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>
            💣
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">
              {table.title} <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">DEMO</span>
            </h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Bet + mines selection — before game starts */}
      {!gameState && (
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

          {/* Mine count selection */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseMines[locale]}</h2>
            <div className="grid grid-cols-5 gap-3">
              {mineOptions.map((count) => (
                <button key={count} onClick={() => setSelectedMines(count)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all ${
                    selectedMines === count ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                  }`}
                  style={selectedMines === count ? { backgroundColor: accentColor } : {}}>
                  {count}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-ink/40">
              <span>x{calculateMultiplier(selectedMines, 1).toFixed(2)} / {t.gemsFound[locale].toLowerCase()}</span>
              <span>{25 - selectedMines} {locale === "fr" ? "gemmes" : "gems"}</span>
            </div>
          </div>

          <button
            onClick={startGame}
            className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
            style={{ backgroundColor: accentColor }}
          >
            💣 Mines — {selectedBet} CRC / {selectedMines} mines (Demo)
          </button>
        </div>
      )}

      {/* Game board — during play */}
      {visible && !isFinished && (
        <MinesBoard
          visible={visible}
          onReveal={handleReveal}
          onCashout={handleCashout}
          disabled={animating}
          accentColor={accentColor}
          locale={locale}
        />
      )}

      {/* Result — after game ends */}
      {visible && isFinished && (
        <ResultPanel
          visible={visible}
          accentColor={accentColor}
          locale={locale}
          onPlayAgain={resetGame}
        />
      )}
    </div>
  );
}

// ── Main export (switches demo / real) ──────────────────

export default function MinesPageClient({ table }: { table: MinesTable }) {
  const { isDemo } = useDemo();
  if (isDemo) return <DemoMinesGame table={table} />;
  return <RealMinesGame table={table} />;
}

// ── Real Game (with blockchain payment) ──────────────────

function RealMinesGame({ table }: { table: MinesTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.mines;
  const tokenRef = usePlayerToken("mines", table.slug);

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [selectedMines, setSelectedMines] = useState<number>(table.mineOptions[1] || 3);
  const [round, setRound] = useState<RoundResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [playerProfile, setPlayerProfile] = useState<{ name?: string; imageUrl?: string | null } | null>(null);
  const [restoring, setRestoring] = useState(true);

  const betOptions = table.betOptions as number[];
  const mineOptions = table.mineOptions as number[];

  // Restore active round on mount — re-runs when token becomes available after SSR hydration
  const tokenValue = tokenRef.current;
  useEffect(() => {
    if (!tokenValue) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/mines/active?tableSlug=${table.slug}&token=${tokenValue}`);
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

  // Payment data encoding — includes mineCount in id
  const gameId = `${table.slug}-${selectedMines}`;
  const dataValue = encodeGameData({ game: "mines", id: gameId, v: 1, t: tokenRef.current || undefined });

  // Scan for payment
  const scanForRound = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`/api/mines-scan?tableSlug=${table.slug}`, { method: "POST" });

      // Fetch active round by token
      const activeRes = await fetch(`/api/mines/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
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

  // Handle reveal action
  const handleReveal = useCallback(async (cellIndex: number) => {
    if (!round || animating) return;
    setAnimating(true);

    try {
      const res = await fetch(`/api/mines/${round.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reveal", cellIndex, playerToken: tokenRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[Mines] Action error:", data.error);
        setAnimating(false);
        return;
      }
      setTimeout(() => {
        setRound(data);
        setAnimating(false);
      }, 200);
    } catch (err) {
      console.error("[Mines] Action fetch error:", err);
      setAnimating(false);
    }
  }, [round, animating]);

  // Handle cashout action
  const handleCashout = useCallback(async () => {
    if (!round || animating) return;
    setAnimating(true);

    try {
      const res = await fetch(`/api/mines/${round.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cashout", playerToken: tokenRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[Mines] Cashout error:", data.error);
        setAnimating(false);
        return;
      }
      setTimeout(() => {
        setRound(data);
        setAnimating(false);
      }, 100);
    } catch (err) {
      console.error("[Mines] Cashout fetch error:", err);
      setAnimating(false);
    }
  }, [round, animating]);

  const resetGame = useCallback(() => {
    setRound(null);
    setWatchingPayment(false);
    setPlayerProfile(null);
    setAnimating(false);
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
            💣
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{table.title}</h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Before payment — bet + mines selection + payment */}
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

          {/* Mine count selection */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseMines[locale]}</h2>
            <div className="grid grid-cols-5 gap-3">
              {mineOptions.map((count) => (
                <button key={count} onClick={() => setSelectedMines(count)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all ${
                    selectedMines === count ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                  }`}
                  style={selectedMines === count ? { backgroundColor: accentColor } : {}}>
                  {count}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-ink/40">
              <span>x{calculateMultiplier(selectedMines, 1).toFixed(2)} / {t.gemsFound[locale].toLowerCase()}</span>
              <span>{25 - selectedMines} {locale === "fr" ? "gemmes" : "gems"}</span>
            </div>
          </div>

          {/* Payment */}
          <ChancePayment
            recipientAddress={table.recipientAddress}
            amountCrc={selectedBet}
            gameType="mines"
            gameId={gameId}
            tableSlug={table.slug}
            accentColor={accentColor}
            payLabel={`Mines — ${selectedBet} CRC / ${selectedMines} mines`}
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

      {/* During game — game board */}
      {round && !isFinished && (
        <MinesBoard
          visible={round as unknown as VisibleState}
          onReveal={handleReveal}
          onCashout={handleCashout}
          disabled={animating}
          accentColor={accentColor}
          locale={locale}
        />
      )}

      {/* After game — result */}
      {round && isFinished && (
        <ResultPanel
          visible={round as unknown as VisibleState}
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
