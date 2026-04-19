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
import { usePlayerToken } from "@/hooks/use-player-token";
import { encodeGameData } from "@/lib/game-data";
import { darkSafeColor } from "@/lib/utils";
import { resolveCoinFlip, calculatePayout, PAYOUT_MULTIPLIER } from "@/lib/coin-flip";
import type { CoinSide, CoinFlipResult } from "@/lib/coin-flip";

type CoinFlipTable = {
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

type FlipResultResponse = {
  id: number;
  playerAddress: string;
  betCrc: number;
  playerChoice: string;
  coinResult: string;
  outcome: string;
  payoutCrc: number | null;
  payoutStatus: string;
  createdAt: string;
};

// ── Coin Animation Component ──────────────────────────

function CoinDisplay({ side, flipping, size = "lg" }: { side: CoinSide | null; flipping?: boolean; size?: "lg" | "xl" }) {
  const sizeClass = size === "xl" ? "w-32 h-32" : "w-24 h-24";
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold shadow-2xl border-4 transition-all duration-300 overflow-hidden`}
      style={{
        background: side === "heads"
          ? "linear-gradient(145deg, #F59E0B, #D97706, #F59E0B)"
          : side === "tails"
          ? "linear-gradient(145deg, #1a1a2e, #251B9F, #1a1a2e)"
          : "linear-gradient(145deg, #CBD5E1, #94A3B8, #CBD5E1)",
        borderColor: side === "heads" ? "#B45309" : side === "tails" ? "#251B9F" : "#475569",
        animation: flipping ? "coinFlip 0.6s ease-in-out infinite" : undefined,
      }}
    >
      {side === "heads" ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src="/crc-logo.png" alt="CRC" className="w-full h-full object-cover" />
      ) : side === "tails" ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src="/nf-society-logo.png" alt="NF" className="w-full h-full object-cover" />
      ) : (
        <span className={size === "xl" ? "text-5xl" : "text-4xl"}>?</span>
      )}
    </div>
  );
}

// ── Demo Game (client-only, no payment) ──────────────

function DemoCoinFlipGame({ table }: { table: CoinFlipTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.coinFlip;

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [selectedChoice, setSelectedChoice] = useState<CoinSide | null>(null);
  const [result, setResult] = useState<CoinFlipResult | null>(null);
  const [flipping, setFlipping] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const betOptions = table.betOptions as number[];

  const doFlip = useCallback(() => {
    if (!selectedChoice || flipping) return;
    setFlipping(true);
    setShowResult(false);

    // Resolve after animation
    setTimeout(() => {
      const flipResult = resolveCoinFlip(selectedChoice, selectedBet);
      setResult(flipResult);
      setFlipping(false);
      setTimeout(() => setShowResult(true), 300);
    }, 1500);
  }, [selectedChoice, selectedBet, flipping]);

  const resetGame = useCallback(() => {
    setResult(null);
    setSelectedChoice(null);
    setShowResult(false);
    setFlipping(false);
  }, []);

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <style>{`
        @keyframes coinFlip {
          0% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg); }
          100% { transform: rotateY(360deg); }
        }
      `}</style>

      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>
            🪙
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">
              {table.title} <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded ml-1">DEMO</span>
            </h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Bet + Choice selection */}
      {!result && !flipping && (
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

          {/* Side selection */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.pickSide[locale]}</h2>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setSelectedChoice("heads")}
                className={`py-6 rounded-2xl text-center font-bold transition-all border-2 ${
                  selectedChoice === "heads"
                    ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 scale-105 shadow-lg"
                    : "border-ink/10 bg-white/60 dark:bg-white/5 hover:border-ink/20"
                }`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/crc-logo.png" alt="CRC" className="w-12 h-12 mx-auto mb-2 rounded-full object-cover" />
                <div className="text-lg text-ink">{t.heads[locale]}</div>
              </button>
              <button onClick={() => setSelectedChoice("tails")}
                className={`py-6 rounded-2xl text-center font-bold transition-all border-2 ${
                  selectedChoice === "tails"
                    ? "border-slate-400 bg-slate-50 dark:bg-slate-900/20 scale-105 shadow-lg"
                    : "border-ink/10 bg-white/60 dark:bg-white/5 hover:border-ink/20"
                }`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/nf-society-logo.png" alt="NF" className="w-12 h-12 mx-auto mb-2 rounded-full object-cover" />
                <div className="text-lg text-ink">{t.tails[locale]}</div>
              </button>
            </div>
          </div>

          {/* Payout info */}
          {selectedChoice && (
            <div className="rounded-xl bg-ink/5 dark:bg-white/5 p-4 text-center">
              <p className="text-sm text-ink/60">
                {t.payout[locale]} : <span className="font-bold text-ink">{calculatePayout(selectedBet)} CRC</span>
                <span className="text-ink/40"> (x{PAYOUT_MULTIPLIER})</span>
              </p>
            </div>
          )}

          {/* Flip button */}
          <button
            onClick={doFlip}
            disabled={!selectedChoice}
            className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 disabled:opacity-40"
            style={{ backgroundColor: accentColor }}>
            🧪 {t.heads[locale]} / {t.tails[locale]} — {selectedBet} CRC (Demo)
          </button>
        </div>
      )}

      {/* Flipping animation */}
      {flipping && (
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <CoinDisplay side={null} flipping size="xl" />
          <p className="text-lg font-bold text-ink animate-pulse">{t.flipping[locale]}</p>
        </div>
      )}

      {/* Result */}
      {showResult && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center py-8 space-y-4">
            <CoinDisplay side={result.coinResult} size="xl" />
            <p className="text-sm text-ink/50">
              {result.coinResult === "heads" ? t.heads[locale] : t.tails[locale]}
            </p>
          </div>

          <div className={`rounded-2xl p-4 text-center ${
            result.outcome === "win"
              ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
          }`}>
            <p className="text-2xl mb-1">{result.outcome === "win" ? "🏆" : "💔"}</p>
            <p className="font-bold text-ink">
              {result.outcome === "win" ? t.youWin[locale] : t.youLose[locale]}
            </p>
            {result.payoutCrc > 0 && (
              <p className="text-sm text-emerald-600 font-bold mt-1">+{Math.round(result.payoutCrc * 1000) / 1000} CRC</p>
            )}
          </div>

          <PnlCard
            gameType="coin_flip"
            result={result.outcome === "win" ? "win" : "loss"}
            betCrc={result.betCrc}
            gainCrc={result.outcome === "win" ? result.payoutCrc - result.betCrc : -result.betCrc}
            playerName="Demo Player"
            date={new Date().toLocaleDateString()}
            locale={locale}
          />

          <button onClick={resetGame} className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90" style={{ backgroundColor: accentColor }}>
            {t.playAgain[locale]}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Main export (switches demo / real) ──────────────────

export default function CoinFlipPageClient({ table }: { table: CoinFlipTable }) {
  const { isDemo } = useDemo();
  if (isDemo) return <DemoCoinFlipGame table={table} />;
  return <RealCoinFlipGame table={table} />;
}

// ── Real Game (with blockchain payment) ──────────────────

function RealCoinFlipGame({ table }: { table: CoinFlipTable }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const accentColor = darkSafeColor(table.accentColor, isDark);
  const t = translations.coinFlip;
  const tokenRef = usePlayerToken("coin_flip", table.slug);

  const [selectedBet, setSelectedBet] = useState<number>(table.betOptions[0] || 5);
  const [selectedChoice, setSelectedChoice] = useState<CoinSide | null>(null);
  const [result, setResult] = useState<FlipResultResponse | null>(null);
  const [flipping, setFlipping] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [playerProfile, setPlayerProfile] = useState<{ name?: string; imageUrl?: string | null } | null>(null);
  const [restoring, setRestoring] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const betOptions = table.betOptions as number[];

  // Restore recent result on mount — re-runs when token becomes available after SSR hydration
  const tokenValue = tokenRef.current;
  useEffect(() => {
    if (!tokenValue) return;
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/coin-flip/active?tableSlug=${table.slug}&token=${tokenValue}`);
        const data = await res.json();
        if (data.result && active) {
          setResult(data.result);
          setShowResult(true);
        }
      } catch {}
      if (active) setRestoring(false);
    })();
    return () => { active = false; };
  }, [table.slug, tokenValue]);

  // Fetch player profile when result available
  useEffect(() => {
    if (!result?.playerAddress || playerProfile) return;
    (async () => {
      try {
        const res = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: [result.playerAddress] }),
        });
        const data = await res.json();
        const profile = data.profiles?.[result.playerAddress.toLowerCase()];
        if (profile) setPlayerProfile(profile);
      } catch {}
    })();
  }, [result?.playerAddress, playerProfile]);

  // Generate data value for payment encoding
  const gameId = selectedChoice ? `${table.slug}-${selectedChoice === "heads" ? "H" : "T"}` : table.slug;
  const dataValue = encodeGameData({ game: "coin_flip", id: gameId, v: 1, t: tokenRef.current || undefined });

  // Scan for payment
  const scanForFlip = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch(`/api/coin-flip-scan?tableSlug=${table.slug}`, { method: "POST" });
      const data = await res.json();

      if (data.results && data.results.length > 0) {
        // Fetch the full result by token
        const activeRes = await fetch(`/api/coin-flip/active?tableSlug=${table.slug}&token=${tokenRef.current}`);
        const activeData = await activeRes.json();
        if (activeData.result) {
          setWatchingPayment(false);

          // Start coin flip animation
          setFlipping(true);
          setTimeout(() => {
            setResult(activeData.result);
            setFlipping(false);
            setTimeout(() => setShowResult(true), 300);
          }, 1500);
        }
      }
    } catch {}
    setScanning(false);
  }, [table.slug]);

  // Poll scan for payment detection
  // Fast poll (5s) when actively watching, slow poll (15s) as fallback
  useEffect(() => {
    if (result || flipping || restoring) return;
    const ms = watchingPayment ? 5000 : 15000;
    const interval = setInterval(scanForFlip, ms);
    return () => clearInterval(interval);
  }, [result, flipping, restoring, watchingPayment, scanForFlip]);

  const resetGame = useCallback(() => {
    setResult(null);
    setSelectedChoice(null);
    setShowResult(false);
    setFlipping(false);
    setWatchingPayment(false);
    setPlayerProfile(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  // Show loader while restoring
  if (restoring) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-ink/30" />
      </div>
    );
  }

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto">
      <style>{`
        @keyframes coinFlip {
          0% { transform: rotateY(0deg); }
          50% { transform: rotateY(180deg); }
          100% { transform: rotateY(360deg); }
        }
      `}</style>

      <div className="mb-6">
        <Link href="/chance" className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-2xl" style={{ backgroundColor: accentColor + "15" }}>
            🪙
          </div>
          <div>
            <h1 className="text-xl font-bold text-ink">{table.title}</h1>
            <p className="text-xs text-ink/40">{t.rtp[locale]}</p>
          </div>
        </div>
      </div>

      {/* Bet + Choice + Payment */}
      {!result && !flipping && (
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

          {/* Side selection */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 dark:bg-white/5 backdrop-blur-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-ink/60 uppercase tracking-widest">{t.pickSide[locale]}</h2>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setSelectedChoice("heads")}
                className={`py-6 rounded-2xl text-center font-bold transition-all border-2 ${
                  selectedChoice === "heads"
                    ? "border-amber-400 bg-amber-50 dark:bg-amber-900/20 scale-105 shadow-lg"
                    : "border-ink/10 bg-white/60 dark:bg-white/5 hover:border-ink/20"
                }`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/crc-logo.png" alt="CRC" className="w-12 h-12 mx-auto mb-2 rounded-full object-cover" />
                <div className="text-lg text-ink">{t.heads[locale]}</div>
              </button>
              <button onClick={() => setSelectedChoice("tails")}
                className={`py-6 rounded-2xl text-center font-bold transition-all border-2 ${
                  selectedChoice === "tails"
                    ? "border-slate-400 bg-slate-50 dark:bg-slate-900/20 scale-105 shadow-lg"
                    : "border-ink/10 bg-white/60 dark:bg-white/5 hover:border-ink/20"
                }`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/nf-society-logo.png" alt="NF" className="w-12 h-12 mx-auto mb-2 rounded-full object-cover" />
                <div className="text-lg text-ink">{t.tails[locale]}</div>
              </button>
            </div>
          </div>

          {/* Payout info */}
          {selectedChoice && (
            <div className="rounded-xl bg-ink/5 dark:bg-white/5 p-4 text-center">
              <p className="text-sm text-ink/60">
                {t.payout[locale]} : <span className="font-bold text-ink">{calculatePayout(selectedBet)} CRC</span>
                <span className="text-ink/40"> (x{PAYOUT_MULTIPLIER})</span>
              </p>
            </div>
          )}

          {/* Payment */}
          {selectedChoice && (
            <ChancePayment
              recipientAddress={table.recipientAddress}
              amountCrc={selectedBet}
              gameType="coin_flip"
              gameId={gameId}
              tableSlug={table.slug}
              accentColor={accentColor}
              payLabel={`${t.heads[locale]} / ${t.tails[locale]} — ${selectedBet} CRC`}
              onPaymentInitiated={async () => {
                await scanForFlip();
                setWatchingPayment(true);
              }}
              onScan={scanForFlip}
              scanning={scanning}
              paymentStatus={watchingPayment ? "watching" : "idle"}
              playerToken={tokenRef.current}
            />
          )}
        </div>
      )}

      {/* Flipping animation */}
      {flipping && (
        <div className="flex flex-col items-center justify-center py-16 space-y-6">
          <CoinDisplay side={null} flipping size="xl" />
          <p className="text-lg font-bold text-ink animate-pulse">{t.flipping[locale]}</p>
        </div>
      )}

      {/* Result */}
      {showResult && result && (
        <div className="space-y-4">
          <div className="flex flex-col items-center py-8 space-y-4">
            <CoinDisplay side={result.coinResult as CoinSide} size="xl" />
            <p className="text-sm text-ink/50">
              {result.coinResult === "heads" ? t.heads[locale] : t.tails[locale]}
            </p>
          </div>

          <div className={`rounded-2xl p-4 text-center ${
            result.outcome === "win"
              ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800"
              : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
          }`}>
            <p className="text-2xl mb-1">{result.outcome === "win" ? "🏆" : "💔"}</p>
            <p className="font-bold text-ink">
              {result.outcome === "win" ? t.youWin[locale] : t.youLose[locale]}
            </p>
            {result.outcome === "win" && result.payoutCrc && (
              <p className="text-sm text-emerald-600 font-bold mt-1">+{Math.round(result.payoutCrc * 1000) / 1000} CRC</p>
            )}
          </div>

          <PnlCard
            gameType="coin_flip"
            result={result.outcome === "win" ? "win" : "loss"}
            betCrc={result.betCrc}
            gainCrc={result.outcome === "win" ? (result.payoutCrc || 0) - result.betCrc : -result.betCrc}
            playerName={playerProfile?.name || shortenAddress(result.playerAddress)}
            playerAvatar={playerProfile?.imageUrl || undefined}
            date={new Date(result.createdAt).toLocaleDateString()}
            locale={locale}
          />

          <button onClick={resetGame} className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90" style={{ backgroundColor: accentColor }}>
            {t.playAgain[locale]}
          </button>
        </div>
      )}
    </div>
  );
}
