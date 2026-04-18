/**
 * CRC Races — server-side helpers.
 * Turn-based with secret actions: submitAction → phase transitions (choice → reveal → resolution → choice).
 */

import { db } from "@/lib/db";
import { crcRacesGames, claimedPayments } from "@/lib/db/schema";
import type { CrcRacesGameRow, CrcRacesPayoutEntry } from "@/lib/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { generateGameCode } from "@/lib/utils";
import { checkAllNewPayments } from "@/lib/circles";
import { executePayout } from "@/lib/payout";
import {
  ACTION_COST,
  calculateSplitPayouts,
  canSubmit,
  chooseBotAction,
  createInitialState,
  CHOICE_PHASE_MS,
  COUNTDOWN_SECONDS,
  horseEmojiForIndex,
  MAX_PLAYERS,
  MIN_PLAYERS,
  REVEAL_PHASE_MS,
  RESOLUTION_PHASE_MS,
  resetPlayerForRace,
  resolveRound,
  TIER_BETS,
  TIER_LIST,
  type PendingAction,
  type RaceAction,
  type RacePlayer,
  type RaceState,
  type RaceStatus,
  type RaceTier,
} from "@/lib/crc-races";

const WEI_PER_CRC = BigInt("1000000000000000000");
const GAME_KEY = "crc-races";

type CreateBody = {
  tier: RaceTier;
  maxPlayers: number;
  isPrivate?: boolean;
  recipientAddress?: string;
};

// ─── Create / Fetch / Lobby ──────────────────────────────

export async function createCrcRace(body: CreateBody): Promise<{ slug: string; game: CrcRacesGameRow }> {
  if (!TIER_LIST.includes(body.tier)) throw new Error("Invalid tier");
  const max = Number(body.maxPlayers);
  if (!Number.isInteger(max) || max < MIN_PLAYERS || max > MAX_PLAYERS) {
    throw new Error(`maxPlayers must be between ${MIN_PLAYERS} and ${MAX_PLAYERS}`);
  }
  const recipient = body.recipientAddress || process.env.SAFE_ADDRESS;
  if (!recipient) throw new Error("No recipient address configured");

  const betCrc = TIER_BETS[body.tier];
  let slug = generateGameCode();
  for (let i = 0; i < 10; i++) {
    const existing = await db.select({ s: crcRacesGames.slug })
      .from(crcRacesGames).where(eq(crcRacesGames.slug, slug)).limit(1);
    if (existing.length === 0) break;
    slug = generateGameCode();
  }

  const state = createInitialState();
  const [row] = await db.insert(crcRacesGames).values({
    slug,
    tier: body.tier,
    betCrc,
    maxPlayers: max,
    commissionPct: 5,
    recipientAddress: recipient,
    isPrivate: !!body.isPrivate,
    players: [],
    status: "waiting" as RaceStatus,
    gameState: state,
    payouts: [],
    payoutStatus: "pending",
  }).returning();

  return { slug, game: row };
}

export async function getCrcRace(slug: string): Promise<CrcRacesGameRow | null> {
  const [row] = await db.select().from(crcRacesGames).where(eq(crcRacesGames.slug, slug)).limit(1);
  return row || null;
}

export async function getLobbyCrcRaces(): Promise<CrcRacesGameRow[]> {
  return db.select().from(crcRacesGames)
    .where(and(eq(crcRacesGames.status, "waiting" as RaceStatus), eq(crcRacesGames.isPrivate, false)))
    .orderBy(desc(crcRacesGames.createdAt))
    .limit(20);
}

// ─── Scan payments ───────────────────────────────────────

export async function scanCrcRacePayments(slug: string): Promise<{ game: CrcRacesGameRow; newPayments: number }> {
  const [game] = await db.select().from(crcRacesGames).where(eq(crcRacesGames.slug, slug)).limit(1);
  if (!game) throw new Error("Race not found");
  if (game.status !== "waiting") return { game, newPayments: 0 };

  const priceWei = BigInt(game.betCrc) * WEI_PER_CRC;
  const allClaimed = await db.select().from(claimedPayments);
  const globalClaimedTxHashes = new Set(allClaimed.map((c) => c.txHash.toLowerCase()));

  const players: RacePlayer[] = Array.isArray(game.players) ? [...game.players] : [];
  const knownTxHashes = new Set<string>(players.map((p) => p.txHash.toLowerCase()));
  const knownAddresses = new Set<string>(players.map((p) => p.address.toLowerCase()));

  const newPayments = await checkAllNewPayments(game.betCrc, game.recipientAddress);
  let claimedCount = 0;

  for (const payment of newPayments) {
    if (players.length >= game.maxPlayers) break;
    const txHash = payment.transactionHash.toLowerCase();
    const playerAddress = payment.sender.toLowerCase();

    if (knownTxHashes.has(txHash)) continue;
    if (globalClaimedTxHashes.has(txHash)) continue;
    if (knownAddresses.has(playerAddress)) continue;
    if (!payment.gameData) continue;
    if (payment.gameData.game !== GAME_KEY || payment.gameData.id !== game.slug) continue;
    try {
      const val = BigInt(payment.value);
      if (val !== priceWei) continue;
    } catch { continue; }

    await db.insert(claimedPayments).values({
      txHash,
      gameType: GAME_KEY,
      gameId: game.id,
      playerAddress,
      amountCrc: game.betCrc,
    }).onConflictDoNothing();

    knownTxHashes.add(txHash);
    globalClaimedTxHashes.add(txHash);
    knownAddresses.add(playerAddress);
    claimedCount++;

    const playerToken = payment.gameData?.t || "";
    players.push(resetPlayerForRace({
      address: playerAddress,
      token: playerToken,
      txHash,
      circlesName: null,
      circlesAvatar: null,
      horseEmoji: horseEmojiForIndex(players.length),
    }));
  }

  let newStatus: RaceStatus = game.status;
  let newState: RaceState = (game.gameState as RaceState) || createInitialState();
  if (players.length >= game.maxPlayers && game.status === "waiting") {
    newStatus = "countdown";
    newState = { ...newState, countdownStartAt: Date.now() };
  }

  await db.update(crcRacesGames).set({
    players, status: newStatus, gameState: newState, updatedAt: new Date(),
  }).where(eq(crcRacesGames.id, game.id));

  const [updated] = await db.select().from(crcRacesGames).where(eq(crcRacesGames.slug, slug)).limit(1);
  return { game: updated, newPayments: claimedCount };
}

// ─── Phase advance / round resolve ────────────────────────

/**
 * Advance phase: countdown → racing (choice phase) → reveal → resolution → next choice → ...
 * Idempotent: returns current game if phase timer hasn't elapsed yet.
 */
export async function tickCrcRace(slug: string): Promise<CrcRacesGameRow | null> {
  const [game] = await db.select().from(crcRacesGames).where(eq(crcRacesGames.slug, slug)).limit(1);
  if (!game) return null;

  let state: RaceState = (game.gameState as RaceState) || createInitialState();
  let players: RacePlayer[] = Array.isArray(game.players) ? [...game.players] : [];
  const now = Date.now();

  // Countdown → racing (choice phase 1)
  if (game.status === "countdown") {
    const elapsed = state.countdownStartAt ? (now - state.countdownStartAt) : 0;
    if (elapsed < COUNTDOWN_SECONDS * 1000) return game;
    const newState: RaceState = {
      ...state, currentRound: 1, phase: "choice", phaseStartAt: now, startedAt: now,
    };
    await db.update(crcRacesGames).set({
      status: "racing" as RaceStatus,
      gameState: newState,
      startedAt: new Date(now),
      updatedAt: new Date(),
    }).where(eq(crcRacesGames.id, game.id));
    return { ...game, status: "racing" as RaceStatus, gameState: newState, startedAt: new Date(now) };
  }

  if (game.status !== "racing") return game;

  const elapsed = now - (state.phaseStartAt || now);

  // Phase: choice → if all submitted OR timer expired → move to reveal
  if (state.phase === "choice") {
    const activePlayers = players.filter((p) => p.finishRank === null);
    const allSubmitted = activePlayers.length > 0 && activePlayers.every((p) => p.pendingAction !== null);
    if (!allSubmitted && elapsed < CHOICE_PHASE_MS) return game;

    // Auto-assign "advance" to those who didn't submit
    players = players.map((p) => {
      if (p.finishRank !== null) return p;
      if (p.pendingAction === null) return { ...p, pendingAction: { action: "advance" as RaceAction, targetAddress: null } };
      return p;
    });
    state = { ...state, phase: "reveal", phaseStartAt: now };
    await db.update(crcRacesGames).set({
      players, gameState: state, updatedAt: new Date(),
    }).where(eq(crcRacesGames.id, game.id));
    return { ...game, players, gameState: state };
  }

  // Phase: reveal → after REVEAL_PHASE_MS → resolution
  if (state.phase === "reveal") {
    if (elapsed < REVEAL_PHASE_MS) return game;
    state = { ...state, phase: "resolution", phaseStartAt: now };
    await db.update(crcRacesGames).set({
      gameState: state, updatedAt: new Date(),
    }).where(eq(crcRacesGames.id, game.id));
    return { ...game, gameState: state };
  }

  // Phase: resolution → after RESOLUTION_PHASE_MS → apply moves, start new choice phase
  if (state.phase === "resolution") {
    if (elapsed < RESOLUTION_PHASE_MS) return game;
    const result = resolveRound(state, players);
    const finished = result.finished;
    const newStatus: RaceStatus = finished ? "finished" : "racing";
    const finishedAtDb = finished ? new Date(now) : null;

    await db.update(crcRacesGames).set({
      players: result.players,
      gameState: result.state,
      status: newStatus,
      finishedAt: finishedAtDb ?? game.finishedAt,
      updatedAt: new Date(),
    }).where(eq(crcRacesGames.id, game.id));

    if (finished) {
      startCrcRacePayouts(game.id).catch((err) => console.error("[CrcRaces] payout error:", err));
    }

    return {
      ...game,
      players: result.players,
      gameState: result.state,
      status: newStatus,
      finishedAt: finishedAtDb ?? game.finishedAt,
    };
  }

  return game;
}

/** Submit a pending action for a given player (identified by playerToken). */
export async function submitCrcRaceAction(
  slug: string,
  playerToken: string,
  action: RaceAction,
  targetAddress: string | null,
): Promise<{ ok: true; game: CrcRacesGameRow } | { ok: false; error: string }> {
  if (!playerToken) return { ok: false, error: "Player token required" };
  const [game] = await db.select().from(crcRacesGames).where(eq(crcRacesGames.slug, slug)).limit(1);
  if (!game) return { ok: false, error: "Race not found" };
  if (game.status !== "racing") return { ok: false, error: "Race not active" };

  const state = (game.gameState as RaceState) || createInitialState();
  const players: RacePlayer[] = Array.isArray(game.players) ? [...game.players] : [];
  const me = players.find((p) => p.token && p.token === playerToken);
  const err = canSubmit(me, players, game.status, state.phase, action, targetAddress);
  if (err) return { ok: false, error: err };
  const myAddr = me!.address.toLowerCase();

  const pending: PendingAction = { action, targetAddress: targetAddress ? targetAddress.toLowerCase() : null };
  const updatedPlayers = players.map((p) =>
    p.address.toLowerCase() === myAddr ? { ...p, pendingAction: pending } : p,
  );

  // Bots submit automatically when a human submits (demo-style AI for injected test players)
  const withBots = updatedPlayers.map((p) => {
    if (p.finishRank !== null) return p;
    if (p.pendingAction) return p;
    if (!p.token.startsWith("fake-") && !p.token.startsWith("bot-")) return p;
    return { ...p, pendingAction: chooseBotAction(p, updatedPlayers, state.currentRound) };
  });

  await db.update(crcRacesGames).set({
    players: withBots, updatedAt: new Date(),
  }).where(eq(crcRacesGames.id, game.id));

  return { ok: true, game: { ...game, players: withBots } };
}

// ─── Payouts ─────────────────────────────────────────────

export async function startCrcRacePayouts(gameId: number): Promise<void> {
  const [game] = await db.select().from(crcRacesGames).where(eq(crcRacesGames.id, gameId)).limit(1);
  if (!game || game.status !== "finished") return;

  const players: RacePlayer[] = Array.isArray(game.players) ? game.players : [];
  const nbPlayers = players.length;
  const shares = calculateSplitPayouts(game.betCrc, nbPlayers, game.commissionPct);
  const winners = players
    .filter((p) => p.finishRank !== null && p.finishRank <= shares.length)
    .sort((a, b) => (a.finishRank! - b.finishRank!));

  const payoutEntries: CrcRacesPayoutEntry[] = winners.map((w) => ({
    rank: w.finishRank!,
    address: w.address,
    amountCrc: shares[w.finishRank! - 1],
    status: "pending",
    txHash: null,
    error: null,
  }));
  const winnerAddress = winners[0]?.address ?? null;

  await db.update(crcRacesGames).set({
    payouts: payoutEntries,
    payoutStatus: "sending",
    winnerAddress,
    updatedAt: new Date(),
  }).where(eq(crcRacesGames.id, gameId));

  const results: CrcRacesPayoutEntry[] = [];
  for (const entry of payoutEntries) {
    try {
      const res = await executePayout({
        gameType: GAME_KEY,
        gameId: `${GAME_KEY}-${game.slug}-${entry.rank}`,
        recipientAddress: entry.address,
        amountCrc: entry.amountCrc,
        reason: `CRC Race ${game.slug} — rank ${entry.rank}`,
      });
      results.push({
        ...entry,
        status: res.success ? "sending" : "failed",
        txHash: res.transferTxHash ?? null,
        error: res.success ? null : (res.error ?? null),
      });
    } catch (err: unknown) {
      results.push({
        ...entry,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const allOk = results.every((r) => r.status !== "failed");
  await db.update(crcRacesGames).set({
    payouts: results,
    payoutStatus: allOk ? "sending" : "partial",
    updatedAt: new Date(),
  }).where(eq(crcRacesGames.id, gameId));
}

// ─── Back-compat stub for old boost endpoint ──────────────

/** Deprecated: kept so existing route doesn't break, but always errors. */
export async function boostCrcRace(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: "Boost removed — use /action submit with new action type" };
}
