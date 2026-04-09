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
import { usePaymentWatcher } from "@/hooks/use-payment-watcher";
import { encodeGameData } from "@/lib/game-data";
import { darkSafeColor } from "@/lib/utils";
import type { Card, Hand, Action, VisibleState, BlackjackState } from "@/lib/blackjack";
import { calculateHandValue, cardDisplay, cardColor, createDeck, dealInitialHands, applyAction, getVisibleState, getAvailableActions } from "@/lib/blackjack";

type BlackjackTable = {
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

type HandResponse = VisibleState & {
  id: number;
  tableId: number;
  playerAddress: string;
  betCrc: number;
  status: string;
  outcome: string | null;
  payoutCrc: number | null;
  payoutStatus: string;
  createdAt: string;
};

// ── Card Component ──────────────────────────────────────

function PlayingCard({ card, hidden = false, delay = 0 }: { card?: Card; hidden?: boolean; delay?: number }) {
  const [flipped, setFlipped] = useState(!hidden);

  useEffect(() => {
    if (!hidden) {
      const t = setTimeout(() => setFlipped(true), delay);
      return () => clearTimeout(t);
    }
  }, [hidden, delay]);

  if (!card || (hidden && !flipped)) {
    // Card back — NF Society logo (full cover)
    return (
      <div
        className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl border border-amber-900/30 overflow-hidden shadow-lg transition-all duration-300"
        style={{
          background: "linear-gradient(145deg, #0d3018, #1a5c2e, #0d3018)",
          animation: delay ? `cardDeal 0.4s ease-out ${delay}ms both` : undefined,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nf-society-logo.png" alt="" className="w-full h-full object-cover opacity-70" />
      </div>
    );
  }

  const isRed = cardColor(card) === "red";
  const suitSymbol = card.suit === "hearts" ? "\u2665" : card.suit === "diamonds" ? "\u2666" : card.suit === "clubs" ? "\u2663" : "\u2660";
  return (
    <div
      className="w-16 h-24 sm:w-20 sm:h-28 rounded-xl border border-amber-700/30 flex flex-col items-center justify-center shadow-lg transition-all duration-300 relative"
      style={{
        background: "linear-gradient(145deg, #0a0a12, #111118, #0a0a12)",
        animation: delay ? `cardDeal 0.4s ease-out ${delay}ms both` : undefined,
      }}
    >
      {/* Top-left rank */}
      <span className="absolute top-1 left-1.5 text-[10px] sm:text-xs font-bold" style={{ color: isRed ? "#EF4444" : "#D4A017" }}>
        {card.rank}
      </span>
      {/* Center suit large */}
      <span className="text-2xl sm:text-3xl" style={{ color: isRed ? "#EF4444" : "#D4A017" }}>
        {suitSymbol}
      </span>
      {/* Center rank */}
      <span className="text-lg sm:text-xl font-black" style={{ color: "#D4A017" }}>
        {card.rank}
      </span>
      {/* Bottom-right rank */}
      <span className="absolute bottom-1 right-1.5 text-[10px] sm:text-xs font-bold rotate-180" style={{ color: isRed ? "#EF4444" : "#D4A017" }}>
        {card.rank}
      </span>
    </div>
  );
}

function HandDisplay({ cards, label, score, isActive, hidden }: {
  cards: Card[];
  label: string;
  score?: number;
  isActive?: boolean;
  hidden?: boolean;
}) {
  return (
    <div className={`flex flex-col items-center gap-2 transition-opacity ${isActive === false ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-bold text-white/50 uppercase tracking-widest">{label}</span>
        {score !== undefined && (
          <span className="text-xs font-bold text-white/80 bg-white/10 px-2 py-0.5 rounded-full">
            {score}
          </span>
        )}
      </div>
      <div className="flex gap-1.5 sm:gap-2">
        {cards.map((card, i) => (
          <PlayingCard
            key={`${card.rank}-${card.suit}-${i}`}
            card={card}
            hidden={hidden && i === 1 && cards.length === 2}
            delay={i * 150}
          />
        ))}
        {/* Hidden card placeholder for dealer */}
        {hidden && cards.length === 1 && (
          <PlayingCard hidden delay={150} />
        )}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────

// ── Demo Blackjack (client-only, no payment) ──────────

function DemoBlackjackGame({ table }: { table: BlackjackTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.blackjack;
  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [gameState, setGameState] = useState<BlackjackState | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const visible = gameState ? getVisibleState(gameState) : null;
  const isFinished = gameState?.status === "finished";

  const startGame = useCallback(() => {
    const deck = createDeck(6);
    const state = dealInitialHands(deck, selectedBet);
    setGameState(state);
  }, [selectedBet]);

  const doAction = useCallback((action: Action) => {
    if (!gameState || actionLoading) return;
    setActionLoading(true);
    try {
      const newState = applyAction(gameState, action);
      setGameState(newState);
    } catch {}
    setActionLoading(false);
  }, [gameState, actionLoading]);

  const resetGame = useCallback(() => setGameState(null), []);

  const betOptions = table.betOptions as number[];

  const playerScore = visible?.playerHands?.[visible.currentHandIndex]
    ? calculateHandValue(visible.playerHands[visible.currentHandIndex].cards).value
    : undefined;
  const dealerScore = visible && !visible.dealerHoleHidden
    ? calculateHandValue(visible.dealerVisibleCards).value
    : visible?.dealerVisibleCards?.[0]
      ? calculateHandValue([visible.dealerVisibleCards[0]]).value
      : undefined;

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <style>{`@keyframes cardDeal { from { opacity: 0; transform: translateY(-30px) scale(0.8); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>

      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>🃏</div>
          <div>
            <h1 className="text-xl font-bold text-ink">{table.title} <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">DEMO</span></h1>
            <p className="text-xs text-ink/40">Blackjack 3:2 · Dealer Stand 17</p>
          </div>
        </div>
      </div>

      {/* Bet selection */}
      {!gameState && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.chooseBet[locale]}</h2>
            <div className="grid grid-cols-4 gap-3">
              {betOptions.map((bet) => (
                <button key={bet} onClick={() => setSelectedBet(bet)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all ${selectedBet === bet ? "text-white shadow-lg scale-105" : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"}`}
                  style={selectedBet === bet ? { backgroundColor: accentColor } : {}}>
                  {bet} CRC
                </button>
              ))}
            </div>
          </div>
          <button onClick={startGame} className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90" style={{ backgroundColor: accentColor }}>
            🧪 {t.betBtn[locale]} {selectedBet} CRC (Demo)
          </button>
        </div>
      )}

      {/* Game table */}
      {visible && (
        <div className="space-y-6">
          <div className="rounded-2xl p-6 sm:p-8 space-y-8" style={{ background: "linear-gradient(135deg, #0d3018, #1a5c2e, #0d3018)", minHeight: 400 }}>
            <HandDisplay cards={visible.dealerVisibleCards} label="Dealer" score={dealerScore} hidden={visible.dealerHoleHidden} />
            <div className="flex items-center justify-center"><div className="h-px flex-1 bg-white/10" /><span className="text-xs font-bold text-white/30 px-3">VS</span><div className="h-px flex-1 bg-white/10" /></div>
            {visible.playerHands.map((playerHand, idx) => {
              const hVal = calculateHandValue(playerHand.cards);
              return (
                <HandDisplay key={idx} cards={playerHand.cards}
                  label={visible.playerHands.length > 1 ? `${t.hand[locale]} ${idx + 1}${playerHand.doubled ? " (x2)" : ""}` : t.you[locale]}
                  score={hVal.value} isActive={idx === visible.currentHandIndex && visible.status === "playing"} />
              );
            })}
          </div>

          {/* Actions */}
          {visible.status === "playing" && visible.availableActions.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {visible.availableActions.includes("hit") && <button onClick={() => doAction("hit")} disabled={actionLoading} className="py-3 rounded-xl font-bold text-sm text-white bg-emerald-600 hover:opacity-90 disabled:opacity-50">{t.hit[locale]}</button>}
              {visible.availableActions.includes("stand") && <button onClick={() => doAction("stand")} disabled={actionLoading} className="py-3 rounded-xl font-bold text-sm text-white bg-red-500 hover:opacity-90 disabled:opacity-50">{t.stand[locale]}</button>}
              {visible.availableActions.includes("double") && <button onClick={() => doAction("double")} disabled={actionLoading} className="py-3 rounded-xl font-bold text-sm text-white bg-amber-500 hover:opacity-90 disabled:opacity-50">{t.double[locale]}</button>}
              {visible.availableActions.includes("split") && <button onClick={() => doAction("split")} disabled={actionLoading} className="py-3 rounded-xl font-bold text-sm text-white bg-violet-500 hover:opacity-90 disabled:opacity-50">{t.split[locale]}</button>}
            </div>
          )}

          {/* Result */}
          {isFinished && gameState && (
            <div className="space-y-4">
              <div className={`rounded-2xl p-4 text-center ${
                gameState.totalPayout > selectedBet ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
                : gameState.totalPayout === selectedBet ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
              }`}>
                <p className="text-2xl mb-1">
                  {gameState.playerHands[0]?.outcome === "blackjack" ? "🃏" : gameState.totalPayout > selectedBet ? "🏆" : gameState.totalPayout === selectedBet ? "🤝" : "💔"}
                </p>
                <p className="font-bold text-ink">
                  {gameState.playerHands[0]?.outcome === "blackjack" ? t.blackjack[locale] :
                   gameState.totalPayout > selectedBet ? t.youWin[locale] :
                   gameState.totalPayout === selectedBet ? t.push[locale] :
                   t.youLose[locale]}
                </p>
                {gameState.totalPayout > 0 && <p className="text-sm text-emerald-600 font-bold mt-1">+{gameState.totalPayout} CRC</p>}
              </div>
              <PnlCard gameType="blackjack" result={gameState.totalPayout > selectedBet ? "win" : gameState.totalPayout === selectedBet ? "draw" : "loss"} betCrc={selectedBet} gainCrc={gameState.totalPayout - selectedBet} playerName="Demo Player" stats={gameState.playerHands[0]?.outcome === "blackjack" ? "Blackjack 3:2" : undefined} date={new Date().toLocaleDateString()} locale={locale} />
              <button onClick={resetGame} className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90" style={{ backgroundColor: accentColor }}>{t.playAgain[locale]}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main export (switches demo / real) ──────────────────

export default function BlackjackPageClient({ table }: { table: BlackjackTable }) {
  const { isDemo } = useDemo();
  if (isDemo) return <DemoBlackjackGame table={table} />;
  return <RealBlackjackGame table={table} />;
}

function RealBlackjackGame({ table }: { table: BlackjackTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.blackjack;

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [handId, setHandId] = useState<number | null>(null);
  const [hand, setHand] = useState<HandResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const confirmedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dataValue = encodeGameData({ game: "blackjack", id: table.slug, v: 1 });

  const { status: paymentStatus } = usePaymentWatcher({
    enabled: watchingPayment,
    dataValue,
    minAmountCRC: selectedBet,
    recipientAddress: table.recipientAddress,
    excludeTxHashes: [],
  });

  // When payment detected, scan for new hands
  useEffect(() => {
    if (paymentStatus === "confirmed") {
      setWatchingPayment(false);
      setShowConfirmed(true);
      scanForHand();
      if (confirmedTimerRef.current) clearTimeout(confirmedTimerRef.current);
      confirmedTimerRef.current = setTimeout(() => setShowConfirmed(false), 3000);
    }
  }, [paymentStatus]);

  const scanForHand = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/blackjack-scan?tableSlug=${table.slug}`, { method: "POST" });
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const newest = data.results[data.results.length - 1];
        setHandId(newest.id);
      }
    } catch {}
    setScanning(false);
  }, [table.slug]);

  // Fetch hand state when handId changes
  useEffect(() => {
    if (!handId) return;
    let active = true;

    async function fetchHand() {
      try {
        const res = await fetch(`/api/blackjack/${handId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (active) setHand(data);
      } catch {}
    }

    fetchHand();

    // Poll while playing
    pollRef.current = setInterval(fetchHand, 2000);
    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [handId]);

  // Stop polling when finished
  useEffect(() => {
    if (hand?.status === "finished" && pollRef.current) {
      clearInterval(pollRef.current);
    }
  }, [hand?.status]);

  const performAction = useCallback(async (action: Action) => {
    if (!handId || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/blackjack/${handId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (res.ok) setHand(data);
    } catch {}
    setActionLoading(false);
  }, [handId, actionLoading]);

  const resetGame = useCallback(() => {
    setHandId(null);
    setHand(null);
    setWatchingPayment(false);
    setShowConfirmed(false);
  }, []);

  const betOptions = table.betOptions as number[];
  const isPlaying = hand && hand.status !== "finished";
  const isFinished = hand && hand.status === "finished";

  // Compute scores
  const playerScore = hand?.playerHands?.[hand.currentHandIndex]
    ? calculateHandValue(hand.playerHands[hand.currentHandIndex].cards).value
    : undefined;
  const dealerScore = hand && !hand.dealerHoleHidden
    ? calculateHandValue(hand.dealerVisibleCards).value
    : hand?.dealerVisibleCards?.[0]
      ? calculateHandValue([hand.dealerVisibleCards[0]]).value
      : undefined;

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <style>{`
        @keyframes cardDeal {
          from { opacity: 0; transform: translateY(-30px) scale(0.8); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      {/* Header */}
      <div className="mb-6">
        <Link href="/blackjack" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.tables[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>
            🃏
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{table.title}</h1>
            <p className="text-xs text-ink/40">Blackjack 3:2 · Dealer Stand 17</p>
          </div>
        </div>
      </div>

      {/* ── No active hand: bet selection + payment ── */}
      {!hand && (
        <div className="space-y-6">
          {/* Bet selector */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">
              {t.chooseBet[locale]}
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {betOptions.map((bet) => (
                <button
                  key={bet}
                  onClick={() => setSelectedBet(bet)}
                  className={`py-3 rounded-xl text-sm font-bold transition-all ${
                    selectedBet === bet
                      ? "text-white shadow-lg scale-105"
                      : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                  }`}
                  style={selectedBet === bet ? { backgroundColor: accentColor } : {}}
                >
                  {bet} CRC
                </button>
              ))}
            </div>
          </div>

          {/* Payment */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <ChancePayment
              recipientAddress={table.recipientAddress}
              amountCrc={selectedBet}
              gameType="blackjack"
              gameId={table.slug}
              accentColor={accentColor}
              payLabel={`${t.betBtn[locale]} ${selectedBet} CRC`}
              onPaymentInitiated={async () => { await scanForHand(); setWatchingPayment(true); }}
              onScan={scanForHand}
              scanning={scanning}
              paymentStatus={showConfirmed ? "confirmed" : watchingPayment ? (paymentStatus === "error" ? "error" : "watching") : "idle"}
            />
          </div>
        </div>
      )}

      {/* ── Active hand: game table ── */}
      {hand && (
        <div className="space-y-6">
          {/* Game table */}
          <div
            className="rounded-2xl p-6 sm:p-8 space-y-8"
            style={{ background: "linear-gradient(135deg, #0d3018, #1a5c2e, #0d3018)", minHeight: 400 }}
          >
            {/* Dealer hand */}
            <HandDisplay
              cards={hand.dealerVisibleCards}
              label={locale === "fr" ? "Dealer" : "Dealer"}
              score={dealerScore}
              hidden={hand.dealerHoleHidden}
            />

            {/* VS divider */}
            <div className="flex items-center justify-center">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs font-bold text-white/30 px-3">VS</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            {/* Player hands */}
            {hand.playerHands.map((playerHand, idx) => {
              const hVal = calculateHandValue(playerHand.cards);
              const isCurrentHand = idx === hand.currentHandIndex && hand.status === "playing";
              return (
                <HandDisplay
                  key={idx}
                  cards={playerHand.cards}
                  label={
                    hand.playerHands.length > 1
                      ? `${t.hand[locale]} ${idx + 1}${playerHand.doubled ? " (x2)" : ""}`
                      : t.you[locale]
                  }
                  score={hVal.value}
                  isActive={isCurrentHand}
                />
              );
            })}
          </div>

          {/* Action buttons */}
          {hand.status === "playing" && hand.availableActions.length > 0 && (
            <div className="grid grid-cols-2 gap-3">
              {hand.availableActions.includes("hit") && (
                <button
                  onClick={() => performAction("hit")}
                  disabled={actionLoading}
                  className="py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "#10B981" }}
                >
                  {actionLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t.hit[locale]}
                </button>
              )}
              {hand.availableActions.includes("stand") && (
                <button
                  onClick={() => performAction("stand")}
                  disabled={actionLoading}
                  className="py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "#EF4444" }}
                >
                  {t.stand[locale]}
                </button>
              )}
              {hand.availableActions.includes("double") && (
                <button
                  onClick={() => performAction("double")}
                  disabled={actionLoading}
                  className="py-3 rounded-xl font-bold text-sm bg-amber-500 text-white transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {t.double[locale]}
                </button>
              )}
              {hand.availableActions.includes("split") && (
                <button
                  onClick={() => performAction("split")}
                  disabled={actionLoading}
                  className="py-3 rounded-xl font-bold text-sm bg-violet-500 text-white transition-all hover:opacity-90 disabled:opacity-50"
                >
                  {t.split[locale]}
                </button>
              )}
              {hand.availableActions.includes("insurance") && (
                <button
                  onClick={() => performAction("insurance")}
                  disabled={actionLoading}
                  className="col-span-2 py-3 rounded-xl font-bold text-sm bg-sky-500 text-white transition-all hover:opacity-90 disabled:opacity-50"
                >
                  Insurance ({Math.floor(hand.baseBet / 2)} CRC)
                </button>
              )}
            </div>
          )}

          {/* Dealer playing indicator */}
          {hand.status === "dealer_turn" && (
            <div className="flex items-center justify-center gap-2 py-3 text-ink/60">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">{t.dealerPlaying[locale]}</span>
            </div>
          )}

          {/* Result */}
          {isFinished && (
            <div className="space-y-4">
              {/* Outcome banner */}
              <div className={`rounded-2xl p-4 text-center ${
                hand.outcome === "blackjack" || hand.outcome === "win"
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
                  : hand.outcome === "push"
                    ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"
                    : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
              }`}>
                <p className="text-2xl mb-1">
                  {hand.outcome === "blackjack" ? "🃏" : hand.outcome === "win" ? "🏆" : hand.outcome === "push" ? "🤝" : "💔"}
                </p>
                <p className="font-bold text-ink">
                  {hand.outcome === "blackjack" ? t.blackjack[locale] :
                   hand.outcome === "win" ? t.youWin[locale] :
                   hand.outcome === "push" ? t.push[locale] :
                   t.youLose[locale]}
                </p>
                {hand.payoutCrc !== null && hand.payoutCrc > 0 && (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                    +{hand.payoutCrc} CRC
                  </p>
                )}
              </div>

              {/* PNL Card */}
              <PnlCard
                gameType="blackjack"
                result={hand.outcome === "blackjack" || hand.outcome === "win" ? "win" : hand.outcome === "push" ? "draw" : "loss"}
                betCrc={hand.betCrc}
                gainCrc={(hand.payoutCrc || 0) - hand.betCrc}
                grossAmount={hand.payoutCrc || 0}
                playerName={hand.playerAddress ? `${hand.playerAddress.slice(0, 6)}...${hand.playerAddress.slice(-4)}` : undefined}
                stats={hand.outcome === "blackjack" ? "Blackjack 3:2" : undefined}
                date={new Date().toLocaleDateString()}
                locale={locale}
              />

              {/* Play again */}
              <button
                onClick={resetGame}
                className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90"
                style={{ backgroundColor: accentColor }}
              >
                {t.playAgain[locale]}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
