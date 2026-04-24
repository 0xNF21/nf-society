"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Forward, Zap, Swords, Shield, Loader2, Check, Trophy, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { CrcRacesTrack } from "@/components/crc-races-track";
import { GamePayment } from "@/components/game-payment";
import { PnlCard } from "@/components/pnl-card";
import { RematchButton, RematchBanner } from "@/components/rematch-button";
import { usePlayerToken } from "@/hooks/use-player-token";
import {
  ACTION_COST,
  CHOICE_PHASE_MS,
  COUNTDOWN_SECONDS,
  MAX_ROUNDS,
  TIER_BETS,
  calculateSplitPayouts,
  chooseBotAction,
  createInitialState,
  horseEmojiForIndex,
  resetPlayerForRace,
  resolveRound,
  type PendingAction,
  type RaceAction,
  type RacePlayer,
  type RaceState,
  type RaceStatus,
  type RaceTier,
} from "@/lib/crc-races";

type RaceGame = {
  id?: number;
  slug: string;
  tier: RaceTier;
  betCrc: number;
  maxPlayers: number;
  commissionPct: number;
  recipientAddress: string;
  isPrivate: boolean;
  players: RacePlayer[];
  status: RaceStatus;
  gameState: RaceState | null;
  winnerAddress: string | null;
  payouts: Array<{ rank: number; address: string; amountCrc: number; status: string }>;
  rematchSlug?: string | null;
};

export default function CrcRacePage() {
  const params = useParams<{ slug: string }>();
  const slug = (params?.slug as string)?.toUpperCase() || "";
  const { isDemo } = useDemo();

  if (slug.startsWith("DEMO")) return <DemoRace slug={slug} />;
  if (isDemo) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink/30" /></div>;
  return <RealRace slug={slug} />;
}

// ─── DEMO RACE ────────────────────────────────────────────

function DemoRace({ slug }: { slug: string }) {
  const { locale } = useLocale();
  const searchParams = useSearchParams();
  const { addXp } = useDemo();
  const t = translations.crcRaces;

  const tier = ((searchParams?.get("tier") as RaceTier | null) || "bronze") as RaceTier;
  const maxPlayers = Math.max(2, Math.min(8, parseInt(searchParams?.get("maxPlayers") || "4", 10)));
  const betCrc = TIER_BETS[tier];

  const initialPlayers = useMemo<RacePlayer[]>(() => {
    const demoAddr = "0xdemo0000000000000000000000000000000dead";
    const arr: RacePlayer[] = [
      resetPlayerForRace({
        address: demoAddr,
        token: "demo",
        txHash: "demo",
        circlesName: "You",
        circlesAvatar: null,
        horseEmoji: horseEmojiForIndex(0),
      }),
    ];
    for (let i = 1; i < maxPlayers; i++) {
      arr.push(resetPlayerForRace({
        address: `0xbot${String(i).padStart(39, "0")}`,
        token: `bot-${i}`,
        txHash: `bot-${i}`,
        circlesName: `Bot ${i}`,
        circlesAvatar: null,
        horseEmoji: horseEmojiForIndex(i),
      }));
    }
    return arr;
  }, [maxPlayers]);

  const [race, setRace] = useState<{ state: RaceState; players: RacePlayer[]; status: RaceStatus }>(() => ({
    state: { ...createInitialState(), countdownStartAt: Date.now() },
    players: initialPlayers,
    status: "countdown",
  }));
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [targetMode, setTargetMode] = useState(false);
  const xpGrantedRef = useRef(false);

  // Countdown → round 1
  useEffect(() => {
    if (race.status !== "countdown") return;
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(id);
          setRace((prev) => ({
            ...prev,
            status: "racing",
            state: { ...prev.state, currentRound: 1, phase: "choice", phaseStartAt: Date.now(), startedAt: Date.now() },
          }));
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [race.status]);

  // Phase driver
  useEffect(() => {
    if (race.status !== "racing") return;
    const { state, players } = race;
    const now = Date.now();
    const elapsed = now - (state.phaseStartAt || now);

    if (state.phase === "choice") {
      const activePlayers = players.filter((p) => p.finishRank === null);
      const allSubmitted = activePlayers.length > 0 && activePlayers.every((p) => p.pendingAction !== null);
      const remaining = Math.max(0, CHOICE_PHASE_MS - elapsed);
      if (allSubmitted || remaining === 0) {
        const timeout = setTimeout(() => {
          setRace((prev) => {
            const filled = prev.players.map((p) =>
              p.finishRank === null && !p.pendingAction
                ? { ...p, pendingAction: { action: "advance" as RaceAction, targetAddress: null } }
                : p,
            );
            return { ...prev, players: filled, state: { ...prev.state, phase: "reveal", phaseStartAt: Date.now() } };
          });
        }, 50);
        return () => clearTimeout(timeout);
      }
      // Ensure bots submit
      const withBots = players.map((p) => {
        if (p.finishRank !== null) return p;
        if (p.pendingAction) return p;
        if (p.token === "demo") return p;
        return { ...p, pendingAction: chooseBotAction(p, players, state.currentRound) };
      });
      if (withBots.some((p, i) => p !== players[i])) {
        setRace((prev) => ({ ...prev, players: withBots }));
      }
      const id = setTimeout(() => {
        setRace((prev) => {
          const now2 = Date.now();
          const el = now2 - (prev.state.phaseStartAt || now2);
          if (el >= CHOICE_PHASE_MS) {
            const filled = prev.players.map((p) =>
              p.finishRank === null && !p.pendingAction
                ? { ...p, pendingAction: { action: "advance" as RaceAction, targetAddress: null } }
                : p,
            );
            return { ...prev, players: filled, state: { ...prev.state, phase: "reveal", phaseStartAt: now2 } };
          }
          return prev;
        });
      }, Math.max(100, remaining));
      return () => clearTimeout(id);
    }

    if (state.phase === "reveal") {
      const id = setTimeout(() => {
        setRace((prev) => ({ ...prev, state: { ...prev.state, phase: "resolution", phaseStartAt: Date.now() } }));
      }, 2500);
      return () => clearTimeout(id);
    }

    if (state.phase === "resolution") {
      const id = setTimeout(() => {
        setRace((prev) => {
          const result = resolveRound(prev.state, prev.players);
          return {
            state: result.state,
            players: result.players,
            status: result.finished ? "finished" : "racing",
          };
        });
      }, 2500);
      return () => clearTimeout(id);
    }
  }, [race]);

  // XP on finish
  useEffect(() => {
    if (race.status !== "finished" || xpGrantedRef.current) return;
    const me = race.players.find((p) => p.token === "demo");
    if (!me) return;
    xpGrantedRef.current = true;
    if (me.finishRank === 1) addXp("races_1st");
    else if (me.finishRank === 2 && maxPlayers >= 3) addXp("races_2nd");
    else if (me.finishRank === 3 && maxPlayers >= 5) addXp("races_3rd");
    else addXp("races_participated");
  }, [race.status, race.players, maxPlayers, addXp]);

  const me = race.players.find((p) => p.token === "demo");
  const shares = calculateSplitPayouts(betCrc, maxPlayers, 5);
  const myGain = me?.finishRank && me.finishRank <= shares.length ? shares[me.finishRank - 1] - betCrc : -betCrc;

  function submitAction(action: RaceAction, targetAddress: string | null = null) {
    setTargetMode(false);
    setRace((prev) => {
      if (prev.status !== "racing" || prev.state.phase !== "choice") return prev;
      const myPlayer = prev.players.find((p) => p.token === "demo");
      if (!myPlayer || myPlayer.finishRank !== null) return prev;
      if (myPlayer.energy < ACTION_COST[action]) return prev;
      if (action === "sabotage" && !targetAddress) return prev;
      const pending: PendingAction = { action, targetAddress };
      return {
        ...prev,
        players: prev.players.map((p) => p.token === "demo" ? { ...p, pendingAction: pending } : p),
      };
    });
  }

  return (
    <RacePageFrame slug={slug} state={race.state} status={race.status} betCrc={betCrc} maxPlayers={maxPlayers} players={race.players} isDemo>
      {race.status === "countdown" && (
        <div className="my-6 text-center">
          <div className="text-6xl font-bold text-marine animate-pulse">{countdown}</div>
        </div>
      )}

      {(race.status === "racing" || race.status === "finished") && (
        <CrcRacesTrack
          players={race.players}
          trackLength={race.state.trackLength}
          myAddress={me?.address}
          showActionBadges={race.state.phase === "reveal" || race.state.phase === "resolution" || race.status === "finished"}
          isTarget={targetMode ? () => false : undefined}
          onPickTarget={targetMode ? (addr) => submitAction("sabotage", addr) : undefined}
        />
      )}

      {me && race.status === "racing" && race.state.phase === "choice" && me.finishRank === null && (
        <ActionPanel
          me={me}
          targetMode={targetMode}
          onCancelTarget={() => setTargetMode(false)}
          onAction={(a) => {
            if (a === "sabotage") setTargetMode(true);
            else submitAction(a);
          }}
        />
      )}

      {me && race.status === "racing" && race.state.phase !== "choice" && (
        <div className="my-4 text-center">
          <p className="text-sm font-semibold text-ink/60 dark:text-white/60">
            {race.state.phase === "reveal" ? t.phaseReveal[locale] : t.phaseResolution[locale]}
          </p>
        </div>
      )}

      {race.status === "finished" && me && (
        <ResultsCard
          rank={me.finishRank}
          totalPlayers={maxPlayers}
          gain={myGain}
          betCrc={betCrc}
          players={race.players}
          isDemo
        />
      )}
    </RacePageFrame>
  );
}

// ─── REAL RACE ────────────────────────────────────────────

function RealRace({ slug }: { slug: string }) {
  const { locale } = useLocale();
  const t = translations.crcRaces;
  const tokenRef = usePlayerToken("crc-races", slug);

  const [game, setGame] = useState<RaceGame | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [targetMode, setTargetMode] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, { name?: string; imageUrl?: string | null }>>({});
  const lastTickSentRef = useRef(0);

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch(`/api/crc-races/${slug}`, { cache: "no-store" });
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) return;
      const data = await res.json();
      setGame(data.game);
    } catch {}
    setLoading(false);
  }, [slug]);

  useEffect(() => {
    fetchGame();
    const id = setInterval(fetchGame, 1500);
    return () => clearInterval(id);
  }, [fetchGame]);

  useEffect(() => {
    if (!game?.players || game.players.length === 0) return;
    const addresses = game.players.map((p) => p.address.toLowerCase()).filter((a) => !profiles[a]);
    if (addresses.length === 0) return;
    (async () => {
      try {
        const res = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses }),
        });
        const data = await res.json();
        if (data.profiles) setProfiles((p) => ({ ...p, ...data.profiles }));
      } catch {}
    })();
  }, [game?.players, profiles]);

  // Tick driver — advance phases server-side
  useEffect(() => {
    if (!game) return;
    if (game.status !== "racing" && game.status !== "countdown") return;
    const id = setInterval(async () => {
      const now = Date.now();
      if (now - lastTickSentRef.current < 600) return;
      lastTickSentRef.current = now;
      try {
        await fetch(`/api/crc-races/${slug}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "tick" }),
        });
      } catch {}
    }, 800);
    return () => clearInterval(id);
  }, [game, slug]);

  async function submitAction(action: RaceAction, targetAddress: string | null = null) {
    setTargetMode(false);
    try {
      const res = await fetch(`/api/crc-races/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          submitAction: action,
          targetAddress,
          playerToken: tokenRef.current,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setGame(data.game);
      }
    } catch {}
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-ink/30" /></div>;
  if (notFound || !game) {
    return <div className="min-h-screen flex items-center justify-center p-6">
      <p className="text-sm text-ink/60">{t.raceNotFound[locale]}</p>
    </div>;
  }

  const enrichedPlayers = game.players.map((p) => {
    const prof = profiles[p.address.toLowerCase()];
    return { ...p, circlesName: p.circlesName || prof?.name || null, circlesAvatar: p.circlesAvatar || prof?.imageUrl || null };
  });

  const me = enrichedPlayers.find((p) => p.token && p.token === tokenRef.current);
  const myAddress = me?.address || null;
  const state: RaceState = game.gameState || createInitialState();
  const shares = calculateSplitPayouts(game.betCrc, game.maxPlayers, game.commissionPct);
  const myGain = !me || me.finishRank === null ? -game.betCrc
    : me.finishRank <= shares.length ? shares[me.finishRank - 1] - game.betCrc
    : -game.betCrc;

  return (
    <RacePageFrame slug={slug} state={state} status={game.status} betCrc={game.betCrc} maxPlayers={game.maxPlayers} players={enrichedPlayers}>
      <GamePayment
        gameKey="crc-races"
        game={{
          slug: game.slug,
          betCrc: game.betCrc,
          recipientAddress: game.recipientAddress,
          status: game.status,
        }}
        players={enrichedPlayers.map((p) => ({ token: p.token }))}
        maxPlayers={game.maxPlayers}
        playerToken={tokenRef.current}
        onScanComplete={fetchGame}
        onBalancePaid={fetchGame}
      />

      {(game.status === "racing" || game.status === "finished") && (
        <CrcRacesTrack
          players={enrichedPlayers}
          trackLength={state.trackLength}
          myAddress={myAddress}
          showActionBadges={state.phase === "reveal" || state.phase === "resolution" || game.status === "finished"}
          onPickTarget={targetMode ? (addr) => submitAction("sabotage", addr) : undefined}
        />
      )}

      {me && game.status === "racing" && state.phase === "choice" && me.finishRank === null && (
        <ActionPanel
          me={me}
          targetMode={targetMode}
          onCancelTarget={() => setTargetMode(false)}
          onAction={(a) => {
            if (a === "sabotage") setTargetMode(true);
            else submitAction(a);
          }}
        />
      )}

      {me && game.status === "racing" && state.phase !== "choice" && (
        <div className="my-4 text-center">
          <p className="text-sm font-semibold text-ink/60 dark:text-white/60">
            {state.phase === "reveal" ? t.phaseReveal[locale] : t.phaseResolution[locale]}
          </p>
        </div>
      )}

      {game.status === "finished" && (
        <>
          {me && (
            <div className="my-4">
              {game.rematchSlug ? (
                <RematchBanner gameKey="crc-races" rematchSlug={game.rematchSlug} />
              ) : (
                <RematchButton gameKey="crc-races" slug={game.slug} rematchSlug={game.rematchSlug ?? null} />
              )}
            </div>
          )}
          <ResultsCard
            rank={me?.finishRank ?? null}
            totalPlayers={game.maxPlayers}
            gain={myGain}
            betCrc={game.betCrc}
            players={enrichedPlayers}
            playerProfile={me ? profiles[me.address.toLowerCase()] || null : null}
            hidePnl={!me}
          />
        </>
      )}
    </RacePageFrame>
  );
}

// ─── Shared frame ─────────────────────────────────────────

function RacePageFrame({
  slug, state, status, betCrc, maxPlayers, players, isDemo, children,
}: {
  slug: string;
  state: RaceState;
  status: RaceStatus;
  betCrc: number;
  maxPlayers: number;
  players: RacePlayer[];
  isDemo?: boolean;
  children: React.ReactNode;
}) {
  const { locale } = useLocale();
  const t = translations.crcRaces;

  const [choiceSec, setChoiceSec] = useState(0);
  useEffect(() => {
    if (status !== "racing" || state.phase !== "choice") { setChoiceSec(0); return; }
    const tick = () => {
      const el = Date.now() - (state.phaseStartAt || Date.now());
      setChoiceSec(Math.max(0, Math.ceil((CHOICE_PHASE_MS - el) / 1000)));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [status, state.phase, state.phaseStartAt]);

  const subtitleLabel =
    status === "waiting" ? t.waiting[locale]
    : status === "countdown" ? t.countdown[locale].replace("{s}", String(COUNTDOWN_SECONDS))
    : status === "racing" && state.phase === "choice"
      ? t.phaseChoice[locale].replace("{s}", String(choiceSec))
    : status === "racing" && state.phase === "reveal" ? t.phaseReveal[locale]
    : status === "racing" && state.phase === "resolution" ? t.phaseResolution[locale]
    : t.finished[locale];

  const submitted = players.filter((p) => p.finishRank === null && p.pendingAction !== null).length;
  const active = players.filter((p) => p.finishRank === null).length;

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <Link href="/crc-races" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-marine text-sm bg-marine/10 px-2.5 py-1 rounded-lg">{slug}</span>
            {isDemo && <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-bold">DEMO</span>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mb-3 text-xs">
          <span className="font-semibold text-ink/50 uppercase tracking-widest">
            {betCrc} CRC · {maxPlayers} {t.players[locale]}
          </span>
          {status === "racing" && (
            <>
              <span className="text-ink/30">·</span>
              <span className="font-semibold text-ink/60">
                {t.round[locale].replace("{n}", String(state.currentRound)).replace("{max}", String(MAX_ROUNDS))}
              </span>
            </>
          )}
        </div>

        <div className="text-center mb-4">
          <span className="text-sm font-bold text-marine">{subtitleLabel}</span>
          {status === "racing" && state.phase === "choice" && active > 0 && (
            <p className="text-[10px] text-ink/40 mt-0.5">{submitted}/{active} {t.submitted[locale]}</p>
          )}
        </div>

        {children}
      </div>
    </div>
  );
}

// ─── Action Panel ─────────────────────────────────────────

function ActionPanel({
  me, targetMode, onCancelTarget, onAction,
}: {
  me: RacePlayer;
  targetMode: boolean;
  onCancelTarget: () => void;
  onAction: (a: RaceAction) => void;
}) {
  const { locale } = useLocale();
  const t = translations.crcRaces;

  if (me.pendingAction) {
    return (
      <div className="my-4 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
          <Check className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
            {t.submitted[locale]}
          </span>
        </div>
        <p className="text-[10px] text-ink/40 mt-1">{t.waitingOthers[locale]}</p>
      </div>
    );
  }

  if (targetMode) {
    return (
      <div className="my-4 flex flex-col items-center gap-2">
        <p className="text-sm font-bold text-rose-500">{t.pickTarget[locale]}</p>
        <button onClick={onCancelTarget} className="text-xs text-ink/50 hover:text-ink inline-flex items-center gap-1">
          <X className="w-3 h-3" /> {t.cancel[locale]}
        </button>
      </div>
    );
  }

  const actions: Array<{ key: RaceAction; icon: React.ReactNode; label: string; desc: string; color: string }> = [
    { key: "advance",  icon: <Forward className="w-5 h-5" />, label: t.actAdvance[locale],  desc: t.actAdvanceDesc[locale],  color: "bg-emerald-500 hover:bg-emerald-600" },
    { key: "sprint",   icon: <Zap className="w-5 h-5" />,     label: t.actSprint[locale],   desc: t.actSprintDesc[locale],   color: "bg-orange-500 hover:bg-orange-600" },
    { key: "sabotage", icon: <Swords className="w-5 h-5" />,  label: t.actSabotage[locale], desc: t.actSabotageDesc[locale], color: "bg-rose-500 hover:bg-rose-600" },
    { key: "shield",   icon: <Shield className="w-5 h-5" />,  label: t.actShield[locale],   desc: t.actShieldDesc[locale],   color: "bg-sky-500 hover:bg-sky-600" },
  ];

  return (
    <div className="my-4 space-y-3">
      <div className="flex items-center justify-center gap-1.5">
        <span className="text-[11px] font-bold text-ink/50 uppercase tracking-widest">{t.energy[locale]}</span>
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full ${i < me.energy ? "bg-amber-400 shadow shadow-amber-400/50" : "bg-ink/10 dark:bg-white/10"}`} />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {actions.map((a) => {
          const cost = ACTION_COST[a.key];
          const disabled = me.energy < cost;
          return (
            <button
              key={a.key}
              onClick={() => !disabled && onAction(a.key)}
              disabled={disabled}
              className={`relative flex flex-col items-center justify-center gap-1 py-4 px-3 rounded-2xl text-white font-bold shadow-md active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed ${a.color}`}
            >
              {a.icon}
              <span className="text-sm font-bold">{a.label}</span>
              <span className="text-[10px] font-medium opacity-90 text-center leading-tight">{a.desc}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Results ──────────────────────────────────────────────

function ResultsCard({
  rank, totalPlayers, gain, betCrc, players, playerProfile, isDemo, hidePnl,
}: {
  rank: number | null;
  totalPlayers: number;
  gain: number;
  betCrc: number;
  players: RacePlayer[];
  playerProfile?: { name?: string; imageUrl?: string | null } | null;
  isDemo?: boolean;
  hidePnl?: boolean;
}) {
  const { locale } = useLocale();
  const t = translations.crcRaces;

  const leaderboard = [...players].sort((a, b) => {
    if (a.finishRank !== null && b.finishRank !== null) return a.finishRank - b.finishRank;
    if (a.finishRank !== null) return -1;
    if (b.finishRank !== null) return 1;
    return b.position - a.position;
  });

  const shares = calculateSplitPayouts(betCrc, totalPlayers, 5);
  const isWin = rank !== null && rank <= shares.length;

  return (
    <div className="my-6 space-y-4">
      <Card className="bg-white/60 backdrop-blur-sm border-ink/10 rounded-2xl">
        <CardContent className="pt-4 px-4 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-citrus" />
            <h2 className="text-base font-bold text-ink">{t.leaderboard[locale]}</h2>
          </div>
          <div className="space-y-1.5">
            {leaderboard.map((p) => {
              const label = p.circlesName || `${p.address.slice(0, 6)}...${p.address.slice(-4)}`;
              const rankLabel = p.finishRank === 1 ? t.rank1[locale]
                : p.finishRank === 2 ? t.rank2[locale]
                : p.finishRank === 3 ? t.rank3[locale]
                : p.finishRank ? t.rankOther[locale].replace("{n}", String(p.finishRank)) : "—";
              const won = p.finishRank !== null && p.finishRank <= shares.length;
              return (
                <div key={p.address} className="flex items-center justify-between p-2 rounded-lg bg-white/50 border border-ink/5">
                  <div className="flex items-center gap-2 min-w-0">
                    {p.circlesAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.circlesAvatar} alt="" className="w-6 h-6 rounded-full" />
                    ) : <span className="text-lg">{p.horseEmoji}</span>}
                    <span className="text-sm font-semibold text-ink truncate">{label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-ink/60">{rankLabel}</span>
                    {won && p.finishRank && (
                      <span className="text-xs font-bold text-emerald-600">+{shares[p.finishRank - 1]} CRC</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {!hidePnl && (
        <PnlCard
          gameType="crc-races"
          gameLabel={t.title[locale]}
          stats={`${rank ? `#${rank}` : "—"} / ${totalPlayers}`}
          result={isWin ? "win" : "loss"}
          betCrc={betCrc}
          gainCrc={Math.round(gain * 1000) / 1000}
          playerName={playerProfile?.name}
          playerAvatar={playerProfile?.imageUrl || undefined}
          date={new Date().toLocaleDateString()}
          locale={locale}
        />
      )}

      {isDemo && (
        <p className="text-[10px] text-ink/40 text-center">
          {t.demoNoPayment[locale]}
        </p>
      )}
    </div>
  );
}
