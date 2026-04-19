"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, TrendingUp, TrendingDown, Banknote, Check, X } from "lucide-react";
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
  createDeck, dealInitialCard, applyAction, getVisibleState, calculatePayout,
  rankValue, suitSymbol, cardColor,
} from "@/lib/hilo";
import type { Card, HiLoState, VisibleState } from "@/lib/hilo";

type HiLoTable = {
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
  betCrc: number;
  outcome: string | null;
  payoutCrc: number | null;
  payoutStatus: string;
  createdAt: string;
};

// ── Playing Card Component ──────────────────────────────

function PlayingCard({ card, size = "md", highlight }: { card: Card; size?: "sm" | "md" | "lg"; highlight?: "correct" | "wrong" | null }) {
  const isRed = cardColor(card) === "red";
  const sym = suitSymbol(card.suit);
  const sizeClasses = {
    sm: "w-10 h-14 text-xs",
    md: "w-16 h-24 sm:w-20 sm:h-28 text-sm",
    lg: "w-24 h-36 sm:w-28 sm:h-40 text-base",
  };
  const borderColor = highlight === "correct" ? "border-emerald-400 shadow-emerald-200/50"
    : highlight === "wrong" ? "border-red-400 shadow-red-200/50"
    : "border-amber-700/30";

  return (
    <div
      className={`${sizeClasses[size]} rounded-xl border-2 ${borderColor} flex flex-col items-center justify-center shadow-lg relative overflow-hidden`}
      style={{ background: "linear-gradient(145deg, #0a0a12, #111118, #0a0a12)" }}
    >
      <span className={`absolute top-1 left-1.5 font-bold ${isRed ? "text-red-400" : "text-slate-300"}`} style={{ fontSize: size === "sm" ? "0.6rem" : undefined }}>
        {card.rank}
      </span>
      <span className={`${size === "lg" ? "text-4xl" : size === "md" ? "text-2xl" : "text-lg"} ${isRed ? "text-red-400" : "text-slate-300"}`}>
        {sym}
      </span>
      <span className={`absolute bottom-1 right-1.5 font-bold ${isRed ? "text-red-400" : "text-slate-300"}`} style={{ fontSize: size === "sm" ? "0.6rem" : undefined }}>
        {card.rank}
      </span>
    </div>
  );
}

function CardBack({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = { sm: "w-10 h-14", md: "w-16 h-24 sm:w-20 sm:h-28", lg: "w-24 h-36 sm:w-28 sm:h-40" };
  return (
    <div
      className={`${sizeClasses[size]} rounded-xl border border-violet-700/40 overflow-hidden shadow-lg`}
      style={{ background: "linear-gradient(145deg, #2e1065, #4c1d95, #2e1065)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/nf-society-logo.png" alt="" className="w-full h-full object-cover opacity-50" />
    </div>
  );
}

// ── Odds Bar ──────────────────────────────────────────

function OddsBar({ higherOdds, lowerOdds, locale }: { higherOdds: number; lowerOdds: number; locale: "fr" | "en" }) {
  const total = 13;
  const equalOdds = total - higherOdds - lowerOdds;
  const t = translations.hiLo;
  return (
    <div className="space-y-1">
      <div className="flex gap-0.5 h-3 rounded-full overflow-hidden">
        {lowerOdds > 0 && (
          <div className="bg-red-400 transition-all" style={{ width: `${(lowerOdds / total) * 100}%` }} />
        )}
        {equalOdds > 0 && (
          <div className="bg-ink/20 dark:bg-white/20 transition-all" style={{ width: `${(equalOdds / total) * 100}%` }} />
        )}
        {higherOdds > 0 && (
          <div className="bg-emerald-400 transition-all" style={{ width: `${(higherOdds / total) * 100}%` }} />
        )}
      </div>
      <div className="flex justify-between text-[10px] text-ink/40">
        <span>{t.lower[locale]} {lowerOdds}/13</span>
        <span>{t.higher[locale]} {higherOdds}/13</span>
      </div>
    </div>
  );
}

// ── Game Board (shared between demo & real) ──────────────

function HiLoBoard({
  visible,
  onAction,
  disabled,
  accentColor,
  locale,
  animating,
}: {
  visible: VisibleState;
  onAction: (action: "higher" | "lower" | "cashout") => void;
  disabled: boolean;
  accentColor: string;
  locale: "fr" | "en";
  animating: boolean;
}) {
  const t = translations.hiLo;

  return (
    <div className="space-y-5">
      {/* History strip */}
      {visible.history.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {visible.history.map((round, i) => (
            <div key={i} className="flex-shrink-0 relative">
              <PlayingCard card={round.card} size="sm" highlight={round.correct ? "correct" : "wrong"} />
              <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] ${round.correct ? "bg-emerald-500" : "bg-red-500"}`}>
                {round.correct ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Streak + Multiplier */}
      <div className="flex items-center justify-center gap-6">
        <div className="text-center">
          <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.streak[locale]}</p>
          <p className="text-2xl font-bold text-ink">{visible.streak}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-ink/40 uppercase tracking-widest">{t.multiplier[locale]}</p>
          <p className="text-2xl font-bold" style={{ color: accentColor }}>x{visible.currentMultiplier.toFixed(2)}</p>
        </div>
      </div>

      {/* Current card */}
      <div className="flex items-center justify-center gap-4">
        <PlayingCard card={visible.currentCard} size="lg" />
        {animating && <CardBack size="lg" />}
      </div>

      {/* Odds */}
      <OddsBar higherOdds={visible.higherOdds} lowerOdds={visible.lowerOdds} locale={locale} />

      {/* Action buttons */}
      {visible.status === "playing" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => onAction("lower")}
              disabled={disabled || !visible.canLower}
              className="py-4 rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#EF4444" }}
            >
              <TrendingDown className="w-5 h-5" />
              <div>
                <div>{t.lower[locale]}</div>
                {visible.canLower && (
                  <div className="text-[10px] font-normal opacity-80">x{visible.lowerMultiplier.toFixed(2)}</div>
                )}
              </div>
            </button>
            <button
              onClick={() => onAction("higher")}
              disabled={disabled || !visible.canHigher}
              className="py-4 rounded-xl font-bold text-white transition-all hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2"
              style={{ backgroundColor: "#10B981" }}
            >
              <TrendingUp className="w-5 h-5" />
              <div>
                <div>{t.higher[locale]}</div>
                {visible.canHigher && (
                  <div className="text-[10px] font-normal opacity-80">x{visible.higherMultiplier.toFixed(2)}</div>
                )}
              </div>
            </button>
          </div>

          {/* Cash out button */}
          {visible.canCashout && (
            <button
              onClick={() => onAction("cashout")}
              disabled={disabled}
              className="w-full py-3 rounded-xl font-bold text-sm transition-all hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2 bg-amber-500 text-white"
            >
              <Banknote className="w-5 h-5" />
              {t.cashoutAmount[locale].replace("{amount}", String(Math.round(visible.potentialPayout * 1000) / 1000))}
            </button>
          )}
        </div>
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
  const t = translations.hiLo;
  const won = visible.status === "cashed_out";
  const payout = calculatePayout({ status: visible.status, betCrc: visible.betCrc, currentMultiplier: visible.currentMultiplier, streak: visible.streak } as HiLoState);

  return (
    <div className="space-y-4">
      {/* History strip */}
      {visible.history.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {visible.history.map((round, i) => (
            <div key={i} className="flex-shrink-0 relative">
              <PlayingCard card={round.card} size="sm" highlight={round.correct ? "correct" : "wrong"} />
              <div className={`absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] ${round.correct ? "bg-emerald-500" : "bg-red-500"}`}>
                {round.correct ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Result banner */}
      <div className={`rounded-2xl p-5 text-center ${
        won
          ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
          : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
      }`}>
        <p className="text-3xl mb-1">{won ? "🏆" : "💔"}</p>
        <p className="font-bold text-lg text-ink">
          {won ? t.cashedOut[locale] : visible.wasEqual ? t.equal[locale] : t.youLose[locale]}
        </p>
        <p className="text-sm text-ink/60 mt-1">
          {t.streak[locale]}: {visible.streak} | x{visible.currentMultiplier.toFixed(2)}
        </p>
        {won && payout > 0 && (
          <p className="text-lg text-emerald-600 font-bold mt-2">+{Math.round(payout * 1000) / 1000} CRC</p>
        )}
      </div>

      <PnlCard
        gameType="hilo"
        result={won ? "win" : "loss"}
        betCrc={visible.betCrc}
        gainCrc={won ? Math.round((payout - visible.betCrc) * 1000) / 1000 : -visible.betCrc}
        playerName={playerName || "Demo Player"}
        playerAvatar={playerAvatar}
        stats={`${t.streak[locale]}: ${visible.streak}`}
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

function DemoHiLoGame({ table }: { table: HiLoTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.hiLo;

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [gameState, setGameState] = useState<HiLoState | null>(null);
  const [animating, setAnimating] = useState(false);

  const betOptions = table.betOptions as number[];

  const startGame = useCallback(() => {
    const deck = createDeck(1);
    const state = dealInitialCard(deck, selectedBet);
    setGameState(state);
  }, [selectedBet]);

  const handleAction = useCallback((action: "higher" | "lower" | "cashout") => {
    if (!gameState || animating) return;
    setAnimating(true);
    setTimeout(() => {
      try {
        const newState = applyAction(gameState, action);
        setGameState(newState);
      } catch {}
      setAnimating(false);
    }, action === "cashout" ? 100 : 600);
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
            🔼
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">
              {table.title} <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">DEMO</span>
            </h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Bet selection — before game starts */}
      {!gameState && (
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

          <button
            onClick={startGame}
            className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
            style={{ backgroundColor: accentColor }}
          >
            🎴 Hi-Lo — {selectedBet} CRC (Demo)
          </button>
        </div>
      )}

      {/* Game board — during play */}
      {visible && !isFinished && (
        <HiLoBoard
          visible={visible}
          onAction={handleAction}
          disabled={animating}
          accentColor={accentColor}
          locale={locale}
          animating={animating}
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

export default function HiLoPageClient({ table }: { table: HiLoTable }) {
  const { isDemo } = useDemo();
  if (isDemo) return <DemoHiLoGame table={table} />;
  return <RealHiLoGame table={table} />;
}

// ── Real Game (with blockchain payment) ──────────────────

function RealHiLoGame({ table }: { table: HiLoTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.hiLo;
  const tokenRef = usePlayerToken("hilo", table.slug);

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [round, setRound] = useState<RoundResponse | null>(null);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [animating, setAnimating] = useState(false);
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
        const res = await fetch(`/api/hilo/active?tableSlug=${table.slug}&token=${tokenValue}`);
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

  // Payment data encoding
  const gameId = table.slug;
  const dataValue = encodeGameData({ game: "hilo", id: gameId, v: 1, t: tokenRef.current || undefined });

  // Scan for payment
  const scanForRound = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`/api/hilo-scan?tableSlug=${table.slug}`, { method: "POST" });

      // Fetch active round by token
      const activeRes = await fetch(`/api/hilo/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
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

  // Handle game action
  const handleAction = useCallback(async (action: "higher" | "lower" | "cashout") => {
    if (!round || animating) return;
    setAnimating(true);

    try {
      const res = await fetch(`/api/hilo/${round.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, playerToken: tokenRef.current }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error("[HiLo] Action error:", data.error);
        setAnimating(false);
        return;
      }
      // Small delay for card reveal animation
      setTimeout(() => {
        setRound(data);
        setAnimating(false);
      }, action === "cashout" ? 100 : 600);
    } catch (err) {
      console.error("[HiLo] Action fetch error:", err);
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
            🔼
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
            gameType="hilo"
            gameId={gameId}
            accentColor={accentColor}
            payLabel={`Hi-Lo — ${selectedBet} CRC`}
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
        <HiLoBoard
          visible={round as unknown as VisibleState}
          onAction={handleAction}
          disabled={animating}
          accentColor={accentColor}
          locale={locale}
          animating={animating}
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
