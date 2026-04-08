"use client";

import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Trophy, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GamePayment } from "@/components/game-payment";
import { PlayerBanner } from "@/components/player-banner";
import { RematchButton, RematchBanner } from "@/components/rematch-button";
import { usePlayerToken } from "@/hooks/use-player-token";
import { useGamePolling } from "@/hooks/use-game-polling";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { resolveRound, getScore, getWinner, isGameOver, getBotMove, createInitialState, MOVE_EMOJI } from "@/lib/pfc";
import type { Move, PfcState, RoundResult } from "@/lib/pfc";
import type { PfcGameRow } from "@/lib/db/schema/pfc";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ─── Hand images for visual duel ───

const HAND_IMAGES: Record<Move, string> = {
  pierre: "✊",
  feuille: "✋",
  ciseaux: "✌️",
};

// ─── Duel Animation ───

function DuelDisplay({ p1Move, p2Move, winner, locale }: {
  p1Move: Move; p2Move: Move; winner: "p1" | "p2" | "draw"; locale: "fr" | "en"
}) {
  const t = translations.pfc;
  return (
    <Card className="bg-white/60 dark:bg-white/5 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-center justify-around">
          <div className="text-center space-y-1">
            <div className={`text-6xl transition-transform duration-500 ${winner === "p1" ? "scale-110" : winner === "p2" ? "opacity-50 scale-90" : ""}`}>
              {HAND_IMAGES[p1Move]}
            </div>
            <p className="text-xs text-ink/50">{MOVE_EMOJI[p1Move]} {t[p1Move][locale]}</p>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-xl font-black text-ink/20">VS</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              winner === "draw" ? "bg-ink/5 text-ink/50" :
              "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400"
            }`}>
              {winner === "p1" ? "J1 ✓" : winner === "p2" ? "J2 ✓" : "="}
            </span>
          </div>
          <div className="text-center space-y-1">
            <div className={`text-6xl transition-transform duration-500 ${winner === "p2" ? "scale-110" : winner === "p1" ? "opacity-50 scale-90" : ""}`}>
              {HAND_IMAGES[p2Move]}
            </div>
            <p className="text-xs text-ink/50">{MOVE_EMOJI[p2Move]} {t[p2Move][locale]}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Move Buttons ───

function MoveButtons({ onMove, disabled }: { onMove: (m: Move) => void; disabled: boolean }) {
  const { locale } = useLocale();
  const t = translations.pfc;
  const moves: { move: Move; hand: string; label: string }[] = [
    { move: "pierre", hand: "✊", label: t.pierre[locale] },
    { move: "feuille", hand: "✋", label: t.feuille[locale] },
    { move: "ciseaux", hand: "✌️", label: t.ciseaux[locale] },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {moves.map(({ move, hand, label }) => (
        <button
          key={move}
          onClick={() => !disabled && onMove(move)}
          disabled={disabled}
          className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all ${
            disabled
              ? "border-ink/5 bg-ink/[0.02] opacity-50 cursor-not-allowed"
              : "border-ink/10 bg-white/80 hover:border-marine/40 hover:bg-marine/5 active:scale-95 cursor-pointer hover:shadow-lg"
          }`}
        >
          <span className="text-5xl">{hand}</span>
          <span className="text-xs font-bold text-ink/60">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Round History ───

function RoundHistory({ rounds, locale }: { rounds: RoundResult[]; locale: "fr" | "en" }) {
  const t = translations.pfc;
  if (rounds.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest">{locale === "fr" ? "Historique" : "History"}</p>
      {rounds.map((r, i) => (
        <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5">
          <span className="text-xs text-ink/40">{t.round[locale]} {i + 1}</span>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{HAND_IMAGES[r.p1]}</span>
            <span className="text-xs text-ink/30 font-bold">VS</span>
            <span className="text-2xl">{HAND_IMAGES[r.p2]}</span>
          </div>
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
            r.winner === "draw" ? "text-ink/50 bg-ink/5" :
            "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30"
          }`}>
            {r.winner === "p1" ? "J1 ✓" : r.winner === "p2" ? "J2 ✓" : "="}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Score Bar ───

function ScoreBar({ score, bestOf, locale }: { score: { p1: number; p2: number }; bestOf: 3 | 5; locale: "fr" | "en" }) {
  return (
    <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5">
      <div className="text-center">
        <p className="text-2xl font-black text-marine dark:text-blue-400">{score.p1}</p>
        <p className="text-[10px] text-ink/40 font-bold">J1</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-ink/40 font-bold uppercase tracking-widest">
          {translations.pfc.score[locale]}
        </p>
        <p className="text-[10px] text-ink/30">BO{bestOf}</p>
      </div>
      <div className="text-center">
        <p className="text-2xl font-black text-citrus">{score.p2}</p>
        <p className="text-[10px] text-ink/40 font-bold">J2</p>
      </div>
    </div>
  );
}

// ─── Demo PFC (vs bot) ───

function DemoPfcGame({ slug }: { slug: string }) {
  const { locale } = useLocale();
  const { addXp, demoPlayer } = useDemo();
  const t = translations.pfc;
  const bestOf = slug.includes("bo5") ? 5 : 3;
  const [state, setState] = useState<PfcState>(createInitialState(bestOf as 3 | 5));
  const [myMove, setMyMove] = useState<Move | null>(null);
  const [botMove, setBotMove] = useState<Move | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [xpGained, setXpGained] = useState(0);
  const xpAdded = useRef(false);

  function handleMove(move: Move) {
    if (revealing || isGameOver(state)) return;
    const bot = getBotMove();
    setMyMove(move);
    setBotMove(bot);
    setRevealing(true);

    setTimeout(() => {
      const winner = resolveRound(move, bot);
      const newState: PfcState = {
        ...state,
        rounds: [...state.rounds, { p1: move, p2: bot, winner }],
        currentRound: {},
      };
      setState(newState);
      setMyMove(null);
      setBotMove(null);
      setRevealing(false);

      if (isGameOver(newState) && !xpAdded.current) {
        xpAdded.current = true;
        const w = getWinner(newState);
        setXpGained(addXp(w === "p1" ? "pfc_win" : "pfc_lose"));
      }
    }, 1500);
  }

  const score = getScore(state);
  const winner = getWinner(state);
  const gameFinished = isGameOver(state);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <Link href="/pfc" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
          </Link>
          <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-bold">DEMO</span>
        </div>

        <ScoreBar score={score} bestOf={bestOf as 3 | 5} locale={locale} />

        {/* Revealing animation */}
        {revealing && myMove && botMove && (
          <Card className="bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-center justify-around">
                <div className="text-center space-y-1">
                  <div className="text-6xl animate-bounce">{HAND_IMAGES[myMove]}</div>
                  <p className="text-xs text-ink/50">{demoPlayer.name}</p>
                </div>
                <span className="text-xl font-black text-ink/20">VS</span>
                <div className="text-center space-y-1">
                  <div className="text-6xl animate-bounce">{HAND_IMAGES[botMove]}</div>
                  <p className="text-xs text-ink/50">Bot 🤖</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Game over */}
        {gameFinished && (
          <Card className="bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardContent className="p-4 text-center space-y-2">
              <Trophy className="w-6 h-6 text-citrus mx-auto" />
              <p className="font-bold text-ink">
                {winner === "p1" ? t.youWon[locale] : t.youLost[locale]}
              </p>
              {xpGained > 0 && <p className="text-xs text-emerald-600 font-bold">+{xpGained} XP</p>}
            </CardContent>
          </Card>
        )}

        {/* Move buttons */}
        {!gameFinished && !revealing && (
          <>
            <p className="text-center text-sm font-semibold text-ink/60">{t.chooseMove[locale]}</p>
            <MoveButtons onMove={handleMove} disabled={false} />
          </>
        )}

        {/* Round history */}
        <RoundHistory rounds={state.rounds} locale={locale} />

        {gameFinished && (
          <Link href="/pfc">
            <Button className="w-full rounded-xl font-bold mt-4" style={{ background: "#DC2626" }}>
              {locale === "fr" ? "Rejouer" : "Play again"}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

// ─── Real PFC (multiplayer) ───

function RealPfcGame({ slug }: { slug: string }) {
  const { locale } = useLocale();
  const t = translations.pfc;
  const { game, loading, fetchGame } = useGamePolling<PfcGameRow>("pfc", slug);
  const playerTokenRef = usePlayerToken("pfc", slug);
  const [myAddress, setMyAddress] = useState("");
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [isCreator, setIsCreator] = useState(false);
  const [moveError, setMoveError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, { name: string; imageUrl: string | null }>>({});

  useEffect(() => {
    setIsCreator(sessionStorage.getItem(`pfc_creator_${slug}`) === "1");
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

  // Fetch profiles
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

  async function handleMove(move: Move) {
    if (!myAddress || !game || game.status !== "playing" || submitting) return;
    setMoveError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/pfc/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ move, playerAddress: myAddress, playerToken: playerTokenRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchGame();
    } catch (e: unknown) {
      setMoveError(e instanceof Error ? e.message : "Error");
    }
    setSubmitting(false);
  }

  // Loading state
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-4">
        <div className="h-5 w-20 rounded-lg bg-ink/[0.08] animate-pulse" />
        <div className="h-16 rounded-xl bg-ink/[0.08] animate-pulse" />
        <div className="h-40 rounded-2xl bg-ink/[0.08] animate-pulse" />
      </div>
    </div>
  );

  if (!game) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-ink/50">{locale === "fr" ? "Partie introuvable" : "Game not found"}</p>
      <Link href="/pfc"><Button variant="outline" className="rounded-xl">{t.back[locale]}</Button></Link>
    </div>
  );

  const state = game.gameState as PfcState | null;
  const myRole = myAddress
    ? (game.player1Address?.toLowerCase() === myAddress.toLowerCase() ? "p1"
      : game.player2Address?.toLowerCase() === myAddress.toLowerCase() ? "p2" : null)
    : null;
  const score = state ? getScore(state) : { p1: 0, p2: 0 };
  const winner = state ? getWinner(state) : null;
  const iHavePlayed = state && myRole ? !!state.currentRound[myRole] : false;
  const winAmount = game.betCrc * 2 * (1 - game.commissionPct / 100);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-4">

        {/* Back + slug */}
        <div className="space-y-2">
          <Link href="/pfc" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/40">{t.gameLabel[locale]}</span>
            <span className="font-mono font-bold text-marine text-sm bg-marine/10 px-2.5 py-1 rounded-lg">{game.slug}</span>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-lg font-bold">{game.betCrc} CRC</span>
          </div>
        </div>

        {/* Payment */}
        <GamePayment
          gameKey="pfc"
          game={game}
          playerToken={playerTokenRef.current}
          isCreator={isCreator}
          onScanComplete={fetchGame}
        />

        {/* Player banner */}
        {game.status !== "waiting_p1" && game.status !== "waiting_p2" && (
          <PlayerBanner
            p1Address={game.player1Address}
            p2Address={game.player2Address}
            myRole={myRole}
            profiles={profiles}
          />
        )}

        {/* Score bar */}
        {state && game.status !== "waiting_p1" && game.status !== "waiting_p2" && (
          <ScoreBar score={score} bestOf={state.bestOf} locale={locale} />
        )}

        {/* Last round duel display */}
        {state && state.rounds.length > 0 && game.status === "playing" && (() => {
          const lastRound = state.rounds[state.rounds.length - 1];
          return <DuelDisplay p1Move={lastRound.p1} p2Move={lastRound.p2} winner={lastRound.winner} locale={locale} />;
        })()}

        {/* Status */}
        {game.status === "playing" && !winner && (
          <Card className="rounded-xl border-0 shadow-sm bg-white/60 backdrop-blur-sm">
            <CardContent className="p-3 text-center">
              {iHavePlayed ? (
                <div className="flex items-center justify-center gap-2 text-ink/60">
                  <Clock className="w-4 h-4" />
                  <span className="text-sm font-semibold">{t.waitingOpponent[locale]}</span>
                </div>
              ) : (
                <span className="text-sm font-bold text-ink">{t.yourTurn[locale]}</span>
              )}
            </CardContent>
          </Card>
        )}

        {/* Game finished */}
        {game.status === "finished" && (
          <Card className="rounded-xl border-0 shadow-sm bg-white/60 backdrop-blur-sm">
            <CardContent className="p-4 text-center space-y-1">
              <div className="flex items-center justify-center gap-2">
                <Trophy className="w-5 h-5 text-citrus" />
                <span className="font-bold text-ink">
                  {!myRole ? t.gameOver[locale] :
                    game.winnerAddress?.toLowerCase() === myAddress.toLowerCase() ? t.youWon[locale] : t.youLost[locale]}
                </span>
              </div>
              {myRole && game.winnerAddress?.toLowerCase() === myAddress.toLowerCase() && (
                <p className="text-xs text-ink/50">{winAmount} CRC {locale === "fr" ? "en route" : "on the way"}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Rematch */}
        {game.status === "finished" && myAddress && (
          <div className="mt-2">
            {game.rematchSlug ? (
              <RematchBanner gameKey="pfc" rematchSlug={game.rematchSlug} />
            ) : (
              <RematchButton gameKey="pfc" slug={game.slug} rematchSlug={game.rematchSlug} />
            )}
          </div>
        )}

        {/* Spectator notice */}
        {game.status === "playing" && !addressConfirmed && (
          <Card className="bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-ink/60">
                {locale === "fr" ? "Mode spectateur — vous regardez cette partie" : "Spectator mode — you are watching this game"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Move buttons */}
        {game.status === "playing" && myRole && !iHavePlayed && !winner && (
          <>
            <p className="text-center text-sm font-semibold text-ink/60">{t.chooseMove[locale]}</p>
            <MoveButtons onMove={handleMove} disabled={submitting} />
            {moveError && <p className="text-xs text-red-500 text-center">{moveError}</p>}
          </>
        )}

        {/* "You played" indicator */}
        {game.status === "playing" && myRole && iHavePlayed && !winner && (
          <div className="text-center text-sm text-ink/40">
            {t.youPlayed[locale]} ✓
          </div>
        )}

        {/* Round history */}
        {state && state.rounds.length > 0 && (
          <RoundHistory rounds={state.rounds} locale={locale} />
        )}

        {/* Play again */}
        {game.status === "finished" && (
          <Link href="/pfc">
            <Button className="w-full rounded-xl font-bold mt-2" style={{ background: "#DC2626" }}>
              {locale === "fr" ? "Rejouer" : "Play again"}
            </Button>
          </Link>
        )}

        {/* Test mode — dev only */}
        {process.env.NODE_ENV === "development" && (
          <div className="mt-2 p-3 rounded-xl border border-dashed border-ink/15 space-y-2">
            <p className="text-xs text-ink/50 text-center font-mono">🧪 Mode test</p>
            {(game.status === "waiting_p1" || game.status === "waiting_p2") && (
              <button onClick={async () => {
                await fetch(`/api/pfc/${slug}/test`, { method: "POST" });
                setMyAddress("0xTEST000000000000000000000000000000000001");
                setAddressConfirmed(true);
                await fetchGame();
              }} className="w-full py-1.5 rounded-lg bg-ink/5 text-xs text-ink/40 hover:text-ink/60 hover:bg-ink/10 transition-all">
                {locale === "fr" ? "Injecter 2 faux joueurs" : "Inject 2 test players"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ───

export default function PfcGamePage() {
  const { slug } = useParams<{ slug: string }>();
  const { isDemo } = useDemo();

  if (isDemo && slug.startsWith("DEMO")) {
    return <DemoPfcGame slug={slug} />;
  }

  return <RealPfcGame slug={slug} />;
}
