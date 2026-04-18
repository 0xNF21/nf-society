/**
 * CRC Races — pure game logic.
 * Turn-based strategy game with secret action submission and simultaneous resolution.
 * Resources: energy (internal, not CRC). Actions: Advance (free), Sprint, Sabotage, Shield.
 */

// ─── Types ────────────────────────────────────────────────

export type RaceTier = "bronze" | "silver" | "gold" | "vip";

export type RaceAction = "advance" | "sprint" | "sabotage" | "shield";

export type RacePhase = "choice" | "reveal" | "resolution";

export type PendingAction = {
  action: RaceAction;
  targetAddress: string | null; // required for sabotage
};

export type RacePlayer = {
  address: string;
  token: string;
  txHash: string;
  circlesName: string | null;
  circlesAvatar: string | null;
  horseEmoji: string;
  position: number;
  energy: number;
  pendingAction: PendingAction | null;
  lastAction: PendingAction | null; // last resolved action (for reveal)
  lastEffect: "sprinted" | "advanced" | "sabotaged" | "shielded" | "blocked_sabotage" | "took_sabotage" | "idle" | null;
  finishRank: number | null;
  finishedAt: number | null;
};

export type RaceState = {
  seed: number;
  currentRound: number;
  phase: RacePhase;
  phaseStartAt: number;
  trackLength: number;
  startedAt: number | null;
  countdownStartAt: number | null;
};

export type RaceStatus =
  | "waiting"
  | "countdown"
  | "racing"
  | "finished"
  | "paid";

// ─── Constants ────────────────────────────────────────────

export const TIER_BETS: Record<RaceTier, number> = {
  bronze: 1,
  silver: 5,
  gold: 20,
  vip: 100,
};

export const TIER_LIST: RaceTier[] = ["bronze", "silver", "gold", "vip"];

export const TRACK_LENGTH = 10;
export const MAX_ROUNDS = 10;
export const COUNTDOWN_SECONDS = 5;

export const CHOICE_PHASE_MS = 12_000;
export const REVEAL_PHASE_MS = 2_500;
export const RESOLUTION_PHASE_MS = 2_500;

export const ENERGY_START = 3;
export const ENERGY_GAIN_PER_ROUND = 1;
export const ENERGY_MAX = 5;

export const ACTION_COST: Record<RaceAction, number> = {
  advance: 0,
  sprint: 3,
  sabotage: 2,
  shield: 1,
};

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const HORSE_EMOJIS = ["\uD83D\uDC0E", "\uD83D\uDC0C", "\uD83D\uDC22", "\uD83D\uDC07", "\uD83E\uDD86", "\uD83E\uDDA9", "\uD83E\uDD84", "\uD83D\uDC38"];

// ─── Helpers ──────────────────────────────────────────────

export function tierFromBet(betCrc: number): RaceTier | null {
  const entry = (Object.entries(TIER_BETS) as [RaceTier, number][]).find(([, v]) => v === betCrc);
  return entry ? entry[0] : null;
}

export function betFromTier(tier: RaceTier): number {
  return TIER_BETS[tier];
}

function rngFromSeed(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function horseEmojiForIndex(i: number): string {
  return HORSE_EMOJIS[i % HORSE_EMOJIS.length];
}

// ─── Splits ───────────────────────────────────────────────

export function splitShares(nbPlayers: number): number[] {
  if (nbPlayers <= 2) return [1.0];
  if (nbPlayers === 3) return [0.8, 0.2];
  if (nbPlayers === 4) return [0.75, 0.25];
  if (nbPlayers <= 6) return [0.65, 0.25, 0.10];
  return [0.60, 0.25, 0.15];
}

export function calculateSplitPayouts(betCrc: number, nbPlayers: number, commissionPct = 5): number[] {
  const pot = betCrc * nbPlayers;
  const distributed = pot * (1 - commissionPct / 100);
  const shares = splitShares(nbPlayers);
  return shares.map((s) => Math.round(distributed * s * 1000) / 1000);
}

// ─── Action validation ───────────────────────────────────

export type SubmitError = "not_racing" | "not_a_player" | "already_finished" | "wrong_phase" | "not_enough_energy" | "invalid_target" | "invalid_action";

export function canSubmit(
  player: RacePlayer | undefined,
  players: RacePlayer[],
  status: RaceStatus,
  phase: RacePhase,
  action: RaceAction,
  targetAddress: string | null,
): SubmitError | null {
  if (!player) return "not_a_player";
  if (status !== "racing") return "not_racing";
  if (phase !== "choice") return "wrong_phase";
  if (player.finishRank !== null) return "already_finished";
  if (!(["advance", "sprint", "sabotage", "shield"] as RaceAction[]).includes(action)) return "invalid_action";
  if (player.energy < ACTION_COST[action]) return "not_enough_energy";
  if (action === "sabotage") {
    if (!targetAddress) return "invalid_target";
    const target = players.find((p) => p.address.toLowerCase() === targetAddress.toLowerCase());
    if (!target) return "invalid_target";
    if (target.address.toLowerCase() === player.address.toLowerCase()) return "invalid_target";
    if (target.finishRank !== null) return "invalid_target";
  }
  return null;
}

// ─── Round resolution ────────────────────────────────────

export type ResolveResult = {
  state: RaceState;
  players: RacePlayer[];
  finished: boolean;
};

/**
 * Resolve the current round by applying all pending actions simultaneously.
 * Deterministic: same (state, players, actions) always produce the same outcome.
 *
 * Order of resolution:
 *  1. Collect shields (who has active shield this round)
 *  2. Apply sabotages: each sabotage tries to push target back -1 (blocked if target has shield)
 *  3. Apply movements: sprint (+4 or +5) / advance (+1, +2 or +3)
 *  4. Deduct energy costs
 *  5. Regenerate +1 energy (cap ENERGY_MAX)
 *  6. Compute finish ranks (position >= trackLength)
 *  7. Clear pendingAction, snapshot lastAction/lastEffect
 */
export function resolveRound(state: RaceState, players: RacePlayer[]): ResolveResult {
  const rng = rngFromSeed(state.seed + state.currentRound * 2654435769);
  const now = Date.now();

  const alreadyFinished = players.filter((p) => p.finishRank !== null).length;

  // Clone + normalize pending actions (default to "advance" if none submitted)
  const withActions = players.map((p) => {
    if (p.finishRank !== null) return { ...p, pendingAction: null, lastAction: null, lastEffect: "idle" as const };
    const pending: PendingAction = p.pendingAction || { action: "advance", targetAddress: null };
    return { ...p, pendingAction: pending };
  });

  // Step 1: shields set
  const shieldedAddresses = new Set(
    withActions
      .filter((p) => p.pendingAction?.action === "shield")
      .map((p) => p.address.toLowerCase()),
  );

  // Step 2: sabotages — for each sabotage, either apply -1 to target or blocked
  const sabotageHits = new Map<string, number>(); // address -> count of hits
  const blockedSabotages = new Set<string>(); // addresses whose sabotage was blocked (informational)
  const sabotageActors = new Set<string>(); // addresses that successfully sabotaged
  for (const p of withActions) {
    if (p.pendingAction?.action !== "sabotage") continue;
    const target = p.pendingAction.targetAddress?.toLowerCase();
    if (!target) continue;
    if (shieldedAddresses.has(target)) {
      blockedSabotages.add(p.address.toLowerCase());
      continue;
    }
    sabotageHits.set(target, (sabotageHits.get(target) || 0) + 1);
    sabotageActors.add(p.address.toLowerCase());
  }

  // Step 3+4: apply per-player effects
  const lastEffects = new Map<string, RacePlayer["lastEffect"]>();
  const updated = withActions.map((p) => {
    if (p.finishRank !== null) return p;
    const pending = p.pendingAction!;
    const addr = p.address.toLowerCase();
    let newPos = p.position;
    let newEnergy = p.energy - (ACTION_COST[pending.action] || 0);
    let effect: RacePlayer["lastEffect"] = "idle";

    if (pending.action === "advance") {
      const r = rng();
      const roll = 1 + Math.floor(r * 3); // 1, 2, or 3
      newPos += roll;
      effect = "advanced";
    } else if (pending.action === "sprint") {
      const r = rng();
      const roll = 4 + Math.floor(r * 2); // 4 or 5
      newPos += roll;
      effect = "sprinted";
    } else if (pending.action === "sabotage") {
      if (blockedSabotages.has(addr)) {
        effect = "idle"; // energy spent but no success
      } else {
        effect = "sabotaged";
      }
    } else if (pending.action === "shield") {
      effect = "shielded";
    }

    // Sabotage hits received by this player
    const hits = sabotageHits.get(addr) || 0;
    if (hits > 0) {
      newPos = Math.max(0, newPos - hits);
      effect = effect === "shielded" ? "blocked_sabotage" : "took_sabotage";
    } else if (shieldedAddresses.has(addr) && blockedSabotages.size > 0) {
      // Shield active even if no one targeted us: still mark as shielded (already set)
    }

    // Regeneration +1 energy
    newEnergy = Math.min(ENERGY_MAX, newEnergy + ENERGY_GAIN_PER_ROUND);

    // Clamp
    newPos = Math.min(state.trackLength, Math.max(0, newPos));
    newEnergy = Math.max(0, newEnergy);

    lastEffects.set(addr, effect);
    return {
      ...p,
      position: newPos,
      energy: newEnergy,
      lastAction: pending,
      pendingAction: null,
      lastEffect: effect,
    };
  });

  // Step 6: finish ranks
  const newlyFinished = updated
    .map((p, idx) => ({ p, idx }))
    .filter(({ p }) => p.finishRank === null && p.position >= state.trackLength)
    .sort((a, b) => b.p.position - a.p.position);

  const withRanks = [...updated];
  let rank = alreadyFinished;
  for (const { idx } of newlyFinished) {
    rank += 1;
    withRanks[idx] = { ...withRanks[idx], finishRank: rank, finishedAt: now };
  }

  const allDone = withRanks.every((p) => p.finishRank !== null);
  const roundLimit = state.currentRound + 1 >= MAX_ROUNDS;
  const finished = allDone || roundLimit;

  // If round limit reached but no one won, fill remaining ranks by position
  if (roundLimit && !allDone) {
    const remaining = withRanks
      .map((p, idx) => ({ p, idx }))
      .filter(({ p }) => p.finishRank === null)
      .sort((a, b) => b.p.position - a.p.position);
    for (const { idx } of remaining) {
      rank += 1;
      withRanks[idx] = { ...withRanks[idx], finishRank: rank, finishedAt: now };
    }
  }

  const newState: RaceState = {
    ...state,
    currentRound: state.currentRound + 1,
    phase: "choice",
    phaseStartAt: now,
  };

  return { state: newState, players: withRanks, finished };
}

// ─── Initial state ────────────────────────────────────────

export function createInitialState(): RaceState {
  return {
    seed: makeSeed(),
    currentRound: 0,
    phase: "choice",
    phaseStartAt: 0,
    trackLength: TRACK_LENGTH,
    startedAt: null,
    countdownStartAt: null,
  };
}

export function resetPlayerForRace(p: Omit<RacePlayer, "position" | "energy" | "pendingAction" | "lastAction" | "lastEffect" | "finishRank" | "finishedAt">): RacePlayer {
  return {
    ...p,
    position: 0,
    energy: ENERGY_START,
    pendingAction: null,
    lastAction: null,
    lastEffect: null,
    finishRank: null,
    finishedAt: null,
  };
}

// ─── Demo bot AI ──────────────────────────────────────────

/**
 * Simple AI: mostly advance, sprint when energy full, sabotage the leader,
 * shield when someone might target us. Deterministic seed for reproducibility.
 */
export function chooseBotAction(
  bot: RacePlayer,
  players: RacePlayer[],
  round: number,
): PendingAction {
  // Not enough energy for paid actions → advance
  if (bot.energy < 1) return { action: "advance", targetAddress: null };

  const leader = players
    .filter((p) => p.address !== bot.address && p.finishRank === null)
    .sort((a, b) => b.position - a.position)[0];

  const amLeader = !leader || bot.position >= leader.position;

  // Randomization but seeded per round+bot for reproducibility
  const seed = round * 2654435769 + Array.from(bot.address).reduce((s, c) => s + c.charCodeAt(0), 0);
  const r = (((seed * 16807) % 2147483647) >>> 0) / 2147483647;

  // If full energy and leader → sprint
  if (bot.energy >= ACTION_COST.sprint && r < 0.45) {
    return { action: "sprint", targetAddress: null };
  }
  // If there is a clear leader and we have energy → sabotage them
  if (!amLeader && leader && bot.energy >= ACTION_COST.sabotage && r < 0.75) {
    return { action: "sabotage", targetAddress: leader.address };
  }
  // Sometimes shield
  if (bot.energy >= ACTION_COST.shield && r < 0.85) {
    return { action: "shield", targetAddress: null };
  }
  return { action: "advance", targetAddress: null };
}

// ─── Shield still-active helper for client display ────────

export function xpActionForRank(rank: number | null, totalPlayers: number): string {
  if (rank === 1) return "races_1st";
  if (rank === 2 && totalPlayers >= 3) return "races_2nd";
  if (rank === 3 && totalPlayers >= 5) return "races_3rd";
  return "races_participated";
}
