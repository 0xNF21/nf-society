"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Trophy, Clock, Users, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GamePayment } from "@/components/game-payment";
import { PlayerBanner } from "@/components/player-banner";
import { RematchButton, RematchBanner } from "@/components/rematch-button";
import { PnlCard } from "@/components/pnl-card";
import { usePlayerToken } from "@/hooks/use-player-token";
import { useGamePolling } from "@/hooks/use-game-polling";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";

type GameStatus = "waiting_p1" | "waiting_p2" | "playing" | "finished" | "cancelled";

interface BoardState {
  matched: Record<string, string>;
  flipped: number[];
  lastFlip?: { indices: number[]; matched: boolean; ts: number };
}

interface MemoryGame {
  id: number;
  slug: string;
  betCrc: number;
  difficulty: "easy" | "medium" | "hard";
  recipientAddress: string;
  commissionPct: number;
  player1Address: string | null;
  player2Address: string | null;
  player1Token: string | null;
  player2Token: string | null;
  player1Pairs: number;
  player2Pairs: number;
  currentTurn: string;
  boardState: string;
  gridSeed: string;
  status: GameStatus;
  result: string | null;
  winnerAddress: string | null;
  rematchSlug: string | null;
  payoutStatus: string;
}

const GRID_CONFIG = {
  easy:   { cols: 4, rows: 3, pairs: 6 },
  medium: { cols: 4, rows: 4, pairs: 8 },
  hard:   { cols: 6, rows: 4, pairs: 12 },
};

const CARD_COLORS = [
  "#EF4444", "#F97316", "#EAB308", "#22C55E", "#06B6D4", "#3B82F6",
  "#8B5CF6", "#EC4899", "#F43F5E", "#14B8A6", "#6366F1", "#A855F7",
];

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  for (let i = result.length - 1; i > 0; i--) {
    h = ((h << 5) - h + i) | 0;
    const j = Math.abs(h) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildGrid(difficulty: "easy" | "medium" | "hard", seed: string): number[] {
  const { pairs } = GRID_CONFIG[difficulty];
  const cards: number[] = [];
  for (let i = 1; i <= pairs; i++) cards.push(i, i);
  return seededShuffle(cards, seed);
}

function MemoryCard({
  value,
  isFlipped,
  isMatched,
  matchedBy,
  onClick,
  disabled,
}: {
  value: number;
  isFlipped: boolean;
  isMatched: boolean;
  matchedBy: string | null;
  onClick: () => void;
  disabled: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const showFace = isFlipped || isMatched;

  return (
    <button
      onClick={onClick}
      disabled={disabled || isMatched}
      className={`aspect-square rounded-xl border-2 transition-all duration-300 transform select-none overflow-hidden
        ${isMatched && matchedBy === "player1" ? "border-blue-400 bg-blue-50 scale-95 opacity-80" :
          isMatched && matchedBy === "player2" ? "border-orange-400 bg-orange-50 scale-95 opacity-80" :
          isFlipped ? "border-pink-400 bg-white scale-105 shadow-lg" :
          disabled ? "border-ink/5 bg-white/50 cursor-default" :
          "border-ink/10 bg-white hover:border-pink-300 hover:shadow-md cursor-pointer active:scale-95"}`}
    >
      {showFace ? (
        <div className="w-full h-full flex items-center justify-center p-1">
          {!imgError ? (
            <Image
              src={`/memory-cards/card-${value}.png`}
              alt={`Card ${value}`}
              width={80}
              height={80}
              className="w-full h-full object-contain"
              onError={() => setImgError(true)}
            />
          ) : (
            <div
              className="w-full h-full rounded-lg flex items-center justify-center text-white font-bold text-lg sm:text-2xl"
              style={{ backgroundColor: CARD_COLORS[(value - 1) % CARD_COLORS.length] }}
            >
              {value}
            </div>
          )}
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center p-1.5">
          <img src="/memory-back.png" alt="?" className="w-full h-full object-contain" />
        </div>
      )}
    </button>
  );
}

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Demo Memory (solo card matching) ───
function DemoMemoryGame({ slug }: { slug: string }) {
  const { locale } = useLocale();
  const { addXp } = useDemo();
  const t = translations.memory;

  // Parse difficulty from slug: DEMO-easy-XXXX, DEMO-medium-XXXX, DEMO-hard-XXXX
  const diffMatch = slug.match(/DEMO-(easy|medium|hard)/);
  const difficulty = (diffMatch?.[1] as "easy" | "medium" | "hard") || "medium";
  const config = GRID_CONFIG[difficulty];

  const [grid] = useState(() => buildGrid(difficulty, slug));
  const [matched, setMatched] = useState<Set<number>>(new Set());
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [startTime] = useState(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [locked, setLocked] = useState(false);
  const [xpGained, setXpGained] = useState(0);
  const finished = matched.size === grid.length;

  // Timer
  useEffect(() => {
    if (finished) return;
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [finished, startTime]);

  // Award XP on completion
  useEffect(() => {
    if (finished && xpGained === 0) {
      setXpGained(addXp("memory_win"));
    }
  }, [finished]);

  function handleClick(index: number) {
    if (locked || matched.has(index) || flipped.includes(index) || finished) return;

    const newFlipped = [...flipped, index];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves(m => m + 1);
      setLocked(true);

      const [a, b] = newFlipped;
      if (grid[a] === grid[b]) {
        // Match!
        setTimeout(() => {
          setMatched(prev => new Set([...prev, a, b]));
          setFlipped([]);
          setLocked(false);
        }, 500);
      } else {
        // No match — flip back
        setTimeout(() => {
          setFlipped([]);
          setLocked(false);
        }, 800);
      }
    }
  }

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-6">
          <Link href="/memory" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
          </Link>
          <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-bold">DEMO</span>
        </div>

        {/* Status */}
        <Card className="mb-4 rounded-xl border-0 shadow-sm bg-white/60 backdrop-blur-sm">
          <CardContent className="p-3">
            {finished ? (
              <div className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-citrus" />
                  <span className="font-bold text-ink">
                    {locale === "fr" ? "Bravo !" : "Well done!"} {moves} {locale === "fr" ? "coups" : "moves"} — {formatTime(elapsed)}
                  </span>
                </div>
                {xpGained > 0 && <span className="text-xs text-emerald-600 font-bold">+{xpGained} XP</span>}
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-pink-500" />
                  <span className="font-semibold text-ink">{matched.size / 2} / {config.pairs} {locale === "fr" ? "paires" : "pairs"}</span>
                </div>
                <div className="flex items-center gap-3 text-ink/50">
                  <span>{moves} {locale === "fr" ? "coups" : "moves"}</span>
                  <span className="font-mono">{formatTime(elapsed)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Grid */}
        <Card className="mb-4 bg-white/70 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
          <CardContent className="p-3">
            <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${config.cols}, 1fr)` }}>
              {grid.map((value, i) => {
                const isFlipped = flipped.includes(i);
                const isMatched = matched.has(i);
                return (
                  <MemoryCard
                    key={i}
                    value={value}
                    isFlipped={isFlipped}
                    isMatched={isMatched}
                    matchedBy={isMatched ? "player1" : null}
                    onClick={() => handleClick(i)}
                    disabled={locked || finished}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>

        {finished && (
          <Link href="/memory">
            <Button className="w-full rounded-xl font-bold mt-2" style={{ background: "#EC4899" }}>
              {locale === "fr" ? "Rejouer" : "Play again"}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

export default function MemoryGamePage() {
  const { slug } = useParams<{ slug: string }>();
  const { isDemo } = useDemo();

  // Demo mode: solo card matching
  if (isDemo && slug.startsWith("DEMO")) {
    return <DemoMemoryGame slug={slug} />;
  }

  return <RealMemoryGame slug={slug} />;
}

function RealMemoryGame({ slug }: { slug: string }) {
  const { locale } = useLocale();
  const t = translations.memory;
  const playerTokenRef = usePlayerToken("memory", slug);
  const { game, loading, fetchGame } = useGamePolling<MemoryGame>("memory", slug);
  const [myAddress, setMyAddress] = useState("");
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, { name: string; imageUrl: string | null }>>({});
  const [flipping, setFlipping] = useState(false);

  const grid = game ? buildGrid(game.difficulty, game.gridSeed) : [];
  const config = game ? GRID_CONFIG[game.difficulty] : GRID_CONFIG.medium;
  const totalPairs = config.pairs;

  const boardState: BoardState = game ? (() => {
    try {
      const p = JSON.parse(game.boardState);
      return { matched: p.matched || {}, flipped: p.flipped || [], lastFlip: p.lastFlip };
    } catch { return { matched: {}, flipped: [] }; }
  })() : { matched: {}, flipped: [] };

  useEffect(() => {
    setIsCreator(sessionStorage.getItem(`memory_creator_${slug}`) === "1");
  }, [slug]);

  // Auto-identify player via token match
  useEffect(() => {
    if (!game || !playerTokenRef.current || addressConfirmed) return;
    const token = playerTokenRef.current;
    if (game.player1Token === token && game.player1Address) {
      setMyAddress(game.player1Address);
      setAddressConfirmed(true);
    } else if (game.player2Token === token && game.player2Address) {
      setMyAddress(game.player2Address);
      setAddressConfirmed(true);
    }
  }, [game?.player1Token, game?.player2Token, game?.status, addressConfirmed]);

  useEffect(() => {
    if (!game) return;
    const addresses = [game.player1Address, game.player2Address].filter(Boolean) as string[];
    if (addresses.length === 0) return;
    const unknown = addresses.filter(a => !profiles[a.toLowerCase()]);
    if (unknown.length === 0) return;
    fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: unknown }),
    }).then(r => r.json()).then(data => {
      if (data.profiles) setProfiles(prev => ({ ...prev, ...data.profiles }));
    }).catch(() => {});
  }, [game?.player1Address, game?.player2Address]);

  const isP1 = myAddress && game?.player1Address?.toLowerCase() === myAddress.toLowerCase();
  const isP2 = myAddress && game?.player2Address?.toLowerCase() === myAddress.toLowerCase();
  const myPlayerKey = isP1 ? "player1" : isP2 ? "player2" : null;
  const isMyTurn = game?.status === "playing" && myPlayerKey === game.currentTurn;

  async function handleCardClick(index: number) {
    if (!game || !myAddress || !isMyTurn || flipping) return;
    if (boardState.matched[String(grid[index])]) return;
    if (boardState.flipped.includes(index)) return;

    setFlipping(true);
    try {
      const res = await fetch(`/api/memory/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerAddress: myAddress, cardIndex: index, playerToken: playerTokenRef.current }),
      });
      await res.json();
      await fetchGame();
    } catch {}
    setFlipping(false);
  }

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-4">
        <div className="flex items-center justify-between mb-6">
          <div className="h-5 w-20 rounded-lg bg-ink/[0.08] animate-pulse motion-reduce:animate-none" />
          <div className="h-7 w-24 rounded-lg bg-pink-500/10 animate-pulse motion-reduce:animate-none" />
        </div>
        <div className="h-16 rounded-xl bg-ink/[0.08] animate-pulse motion-reduce:animate-none" />
        <div className="h-12 rounded-xl bg-ink/[0.08] animate-pulse motion-reduce:animate-none" />
        <div className="grid grid-cols-4 gap-1.5">
          {Array.from({ length: 16 }).map((_, i) => (
            <div key={i} className="aspect-square rounded-xl bg-ink/[0.08] animate-pulse motion-reduce:animate-none" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="h-16 rounded-xl bg-ink/[0.08] animate-pulse motion-reduce:animate-none" />
          <div className="h-16 rounded-xl bg-ink/[0.08] animate-pulse motion-reduce:animate-none" />
        </div>
      </div>
    </div>
  );

  if (!game) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-ink/50">{locale === "fr" ? "Partie introuvable" : "Game not found"}</p>
      <Link href="/memory"><Button variant="outline" className="rounded-xl">← {t.back[locale]}</Button></Link>
    </div>
  );

  const winAmount = game.betCrc * 2 * (1 - game.commissionPct / 100);
  const iWon = game.status === "finished" && myAddress && game.winnerAddress?.toLowerCase() === myAddress.toLowerCase();
  const iLost = game.status === "finished" && !!myAddress && !iWon && game.result !== "draw";

  // Cards currently revealed (flipped + lastFlip if recent no-match)
  const revealedIndices = new Set(boardState.flipped);
  if (boardState.lastFlip && !boardState.lastFlip.matched) {
    for (const idx of boardState.lastFlip.indices) revealedIndices.add(idx);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Back + slug */}
        <div className="mb-6 space-y-2">
          <Link href="/memory" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/40">{t.gameLabel[locale]}</span>
            <span className="font-mono font-bold text-pink-500 text-sm bg-pink-500/10 px-2.5 py-1 rounded-lg">{game.slug}</span>
          </div>
        </div>

        {/* Status banner */}
        <Card className="mb-4 rounded-xl border-0 shadow-sm bg-white/60 backdrop-blur-sm">
          <CardContent className="p-0 overflow-hidden text-center">
            {game.status === "waiting_p1" && (
              <div className="flex items-center justify-center gap-2 text-ink/60 py-3 px-4">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-semibold">{t.waitingP1[locale]}</span>
              </div>
            )}
            {game.status === "waiting_p2" && (
              <div className="flex items-center justify-center gap-2 text-ink/60 py-3 px-4">
                <Users className="w-4 h-4" />
                <span className="text-sm font-semibold">{t.waitingP2[locale]}</span>
              </div>
            )}
            {game.status === "playing" && (
              <div className="flex items-center justify-center gap-2 py-3 px-4">
                <Brain className="w-5 h-5" style={{ color: game.currentTurn === "player1" ? "#3B82F6" : "#F97316" }} />
                <span className="text-sm font-bold text-ink">
                  {isMyTurn
                    ? t.yourTurn[locale]
                    : `${locale === "fr" ? "Tour de" : "Turn of"} ${game.currentTurn === "player1" ? "J1" : "J2"}`}
                </span>
              </div>
            )}
            {game.status === "finished" && game.result === "draw" && (
              <p className="text-sm font-bold text-ink/70 py-3 px-4">{t.draw[locale]}</p>
            )}
            {game.status === "finished" && game.result !== "draw" && (
              <div className="space-y-1 py-3 px-4">
                <div className="flex items-center justify-center gap-2">
                  <Trophy className="w-5 h-5 text-yellow-500" />
                  <span className="font-bold text-ink">{iWon ? t.youWon[locale] : iLost ? t.youLost[locale] : t.gameOver[locale]}</span>
                </div>
                <p className="text-xs text-ink/50">
                  {t.betWon[locale]} <span className="font-bold text-ink/60">{winAmount} CRC</span>
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rematch */}
        {game.status === "finished" && myAddress && (
          <div className="my-4">
            {game.rematchSlug ? (
              <RematchBanner gameKey="memory" rematchSlug={game.rematchSlug} />
            ) : (
              <RematchButton gameKey="memory" slug={game.slug} rematchSlug={game.rematchSlug} />
            )}
          </div>
        )}

        {/* PNL Card */}
        {game.status === "finished" && myAddress && (() => {
          const isDraw = game.result === "draw";
          const myProfile = profiles[myAddress.toLowerCase()];
          const oppAddr = game.player1Address?.toLowerCase() === myAddress.toLowerCase() ? game.player2Address : game.player1Address;
          const oppProfile = oppAddr ? profiles[oppAddr.toLowerCase()] : null;
          return (
            <PnlCard
              gameType="memory"
              result={isDraw ? "draw" : iWon ? "win" : "loss"}
              betCrc={game.betCrc}
              gainCrc={isDraw ? 0 : iWon ? Math.round((winAmount - game.betCrc) * 1000) / 1000 : -game.betCrc}
              playerName={myProfile?.name}
              playerAvatar={myProfile?.imageUrl || undefined}
              opponentName={oppProfile?.name || (oppAddr ? `${oppAddr.slice(0, 6)}...${oppAddr.slice(-4)}` : undefined)}
              opponentAvatar={oppProfile?.imageUrl || undefined}
              date={new Date().toLocaleDateString()}
              locale={locale}
            />
          );
        })()}

        {/* Payment section */}
        <GamePayment
          gameKey="memory"
          game={game}
          playerToken={playerTokenRef.current}
          isCreator={isCreator}
          onScanComplete={fetchGame}
        />

        {/* Player banner */}
        {game.status !== "waiting_p1" && game.status !== "waiting_p2" && (
          <div className="mb-4">
            <PlayerBanner
              p1Address={game.player1Address}
              p2Address={game.player2Address}
              myRole={isP1 ? "p1" : isP2 ? "p2" : null}
              profiles={profiles}
            />
          </div>
        )}

        {/* Spectator notice */}
        {game.status === "playing" && !addressConfirmed && (
          <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-ink/60 dark:text-white/60">
                {locale === "fr" ? "Mode spectateur — vous regardez cette partie" : "Spectator mode — you are watching this game"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Score bar */}
        {(game.status === "playing" || game.status === "finished") && (
          <div className="flex items-center justify-around mb-3 p-3 bg-white/60 backdrop-blur-sm border border-ink/10 rounded-xl">
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase" style={{ color: "#3B82F6" }}>J1</p>
              <p className="text-xl font-bold" style={{ color: "#3B82F6" }}>{game.player1Pairs}</p>
              <p className="text-[10px] text-ink/40">{t.pairs[locale]}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold text-ink/40 uppercase">VS</p>
              <p className="text-sm text-ink/50">{Object.keys(boardState.matched).length}/{totalPairs}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase" style={{ color: "#F97316" }}>J2</p>
              <p className="text-xl font-bold" style={{ color: "#F97316" }}>{game.player2Pairs}</p>
              <p className="text-[10px] text-ink/40">{t.pairs[locale]}</p>
            </div>
          </div>
        )}

        {/* Memory grid */}
        {(game.status === "playing" || game.status === "finished") && (
          <Card className="mb-4 bg-white/70 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardContent className="p-3">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${config.cols}, 1fr)` }}
              >
                {grid.map((value, i) => {
                  const isMatched = !!boardState.matched[String(value)];
                  const matchedBy = boardState.matched[String(value)] || null;
                  const isFlipped = revealedIndices.has(i);
                  const canClick = isMyTurn && !isMatched && !isFlipped && !flipping && addressConfirmed;

                  return (
                    <MemoryCard
                      key={i}
                      value={value}
                      isFlipped={isFlipped}
                      isMatched={isMatched}
                      matchedBy={matchedBy}
                      onClick={() => canClick && handleCardClick(i)}
                      disabled={!canClick}
                    />
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Players */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: "J1", key: "player1", addr: game.player1Address, pairs: game.player1Pairs, color: "#3B82F6" },
            { label: "J2", key: "player2", addr: game.player2Address, pairs: game.player2Pairs, color: "#F97316" },
          ].map(({ label, key, addr, pairs, color }) => {
            const isMe = !!myAddress && addr?.toLowerCase() === myAddress.toLowerCase();
            const isTurn = game.status === "playing" && game.currentTurn === key;
            const profile = addr ? profiles[addr.toLowerCase()] : undefined;
            return (
              <div key={label}
                className="bg-white/60 backdrop-blur-sm border-2 rounded-xl p-3 transition-all"
                style={{ borderColor: isTurn ? color : "rgba(0,0,0,0.1)" }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>{label}</p>
                  {isTurn && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: color }}>
                    {isMe ? "→" : "⏳"}
                  </span>}
                </div>
                {addr ? (
                  <p className="text-xs font-semibold text-ink/70">
                    {profile?.name || shortenAddress(addr)}
                    {isMe && <span className="text-ink/50 ml-1">({locale === "fr" ? "vous" : "you"})</span>}
                  </p>
                ) : (
                  <p className="text-xs text-ink/50">{t.waiting[locale]}</p>
                )}
              </div>
            );
          })}
        </div>

        {/* Test mode */}
        {process.env.NODE_ENV === "development" && (
          <div className="mt-2 p-3 rounded-xl border border-dashed border-ink/15 space-y-2">
            <p className="text-xs text-ink/50 text-center font-mono">🧪 Mode test</p>
            {(game.status === "waiting_p1" || game.status === "waiting_p2") && (
              <button
                onClick={async () => {
                  setTestLoading(true);
                  try {
                    await fetch(`/api/memory/${slug}/test`, { method: "POST" });
                    setMyAddress("0xtest000000000000000000000000000000000001");
                    setAddressConfirmed(true);
                    await fetchGame();
                  } catch {}
                  setTestLoading(false);
                }}
                disabled={testLoading}
                className="w-full py-1.5 rounded-lg bg-ink/5 text-xs text-ink/40 hover:text-ink/60 hover:bg-ink/10 transition-all"
              >
                {testLoading ? "..." : locale === "fr" ? "Injecter 2 faux joueurs" : "Inject 2 test players"}
              </button>
            )}
            {game.status === "playing" && !addressConfirmed && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setMyAddress("0xtest000000000000000000000000000000000001"); setAddressConfirmed(true); }}
                  className="py-1.5 rounded-lg text-xs font-bold transition-all" style={{ background: "rgba(59,130,246,0.1)", color: "#3B82F6" }}>
                  {locale === "fr" ? "Jouer en J1" : "Play as P1"}
                </button>
                <button onClick={() => { setMyAddress("0xtest000000000000000000000000000000000002"); setAddressConfirmed(true); }}
                  className="py-1.5 rounded-lg text-xs font-bold transition-all" style={{ background: "rgba(249,115,22,0.1)", color: "#F97316" }}>
                  {locale === "fr" ? "Jouer en J2" : "Play as P2"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
