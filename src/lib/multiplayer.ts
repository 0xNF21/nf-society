/**
 * Generic multiplayer game helpers.
 * Server-side only — used by API routes.
 */

import { db } from "@/lib/db";
import { claimedPayments } from "@/lib/db/schema";
import { eq, and, or, desc } from "drizzle-orm";
import { generateGameCode } from "@/lib/utils";
import { checkAllNewPayments } from "@/lib/circles";
import { getServerGameConfig, ALL_SERVER_GAMES } from "@/lib/game-registry-server";

const WEI_PER_CRC = BigInt("1000000000000000000");

// ─── CREATE GAME ───

export async function createMultiplayerGame(
  gameKey: string,
  body: { betCrc: number; isPrivate?: boolean; [key: string]: unknown }
) {
  const config = getServerGameConfig(gameKey);

  if (!body.betCrc || typeof body.betCrc !== "number" || body.betCrc <= 0) {
    throw new Error("betCrc must be a positive number");
  }

  // Game-specific validation
  if (config.createExtraValidation) {
    const err = config.createExtraValidation(body);
    if (err) throw new Error(err);
  }

  const recipient = (body.recipientAddress as string) || process.env.SAFE_ADDRESS;
  if (!recipient) throw new Error("No recipient address configured");

  // Generate unique slug with collision check
  let slug = generateGameCode();
  let attempts = 0;
  while (attempts < 10) {
    try {
      const existing = await db.select({ s: config.table.slug })
        .from(config.table)
        .where(eq(config.table.slug, slug))
        .limit(1);
      if (existing.length === 0) break;
    } catch {
      // If slug check fails, just use the generated slug
      break;
    }
    slug = generateGameCode();
    attempts++;
  }

  // Build insert values
  const values: Record<string, unknown> = {
    slug,
    betCrc: body.betCrc,
    recipientAddress: recipient,
    commissionPct: 5,
    isPrivate: !!body.isPrivate,
  };

  // Add game-specific fields
  if (config.createExtraFields) {
    Object.assign(values, config.createExtraFields(body));
  }

  const result = await db.insert(config.table).values(values).returning();
  const game = (result as Record<string, unknown>[])[0];
  return { slug, game };
}

// ─── GET GAME ───

export async function getMultiplayerGame(gameKey: string, slug: string) {
  const config = getServerGameConfig(gameKey);
  const [game] = await db.select()
    .from(config.table)
    .where(eq(config.table.slug, slug))
    .limit(1);
  return game || null;
}

// ─── SCAN PAYMENTS ───

export async function scanGamePayments(gameKey: string, slug: string) {
  const config = getServerGameConfig(gameKey);

  const [game] = await db.select()
    .from(config.table)
    .where(eq(config.table.slug, slug))
    .limit(1);

  if (!game) throw new Error("Game not found");

  // Skip if game already started
  if (config.skipStatuses.includes(game.status)) {
    return { game, newPayments: 0 };
  }

  const priceWei = BigInt(game.betCrc) * WEI_PER_CRC;

  // Get all globally claimed payments
  const allClaimed = await db.select().from(claimedPayments);
  const globalClaimedTxHashes = new Set(allClaimed.map((c) => c.txHash.toLowerCase()));

  // Known tx hashes for this game
  const knownTxHashes = new Set<string>();
  if (game.player1TxHash) knownTxHashes.add(game.player1TxHash.toLowerCase());
  if (game.player2TxHash) knownTxHashes.add(game.player2TxHash.toLowerCase());

  // Fetch new payments from blockchain
  const newPayments = await checkAllNewPayments(game.betCrc, game.recipientAddress);
  let claimedCount = 0;

  console.log(`[Scan ${gameKey}] Found ${newPayments.length} payments for ${game.betCrc} CRC, slug=${slug}`);
  for (const p of newPayments) {
    console.log(`[Scan ${gameKey}] tx=${p.transactionHash.slice(0,12)}... gameData=${JSON.stringify(p.gameData)} claimed=${globalClaimedTxHashes.has(p.transactionHash.toLowerCase())}`);
  }

  for (const payment of newPayments) {
    const txHash = payment.transactionHash.toLowerCase();
    const playerAddress = payment.sender.toLowerCase();

    if (knownTxHashes.has(txHash)) continue;
    if (globalClaimedTxHashes.has(txHash)) continue;

    // Validate game data
    if (!payment.gameData) continue;
    if (payment.gameData.game !== gameKey || payment.gameData.id !== game.slug) continue;

    // Validate amount
    try {
      const val = BigInt(payment.value);
      if (val !== priceWei) continue;
    } catch {
      continue;
    }

    // Claim the payment
    await db.insert(claimedPayments).values({
      txHash,
      gameType: gameKey,
      gameId: game.id,
      playerAddress,
      amountCrc: game.betCrc,
    }).onConflictDoNothing();

    knownTxHashes.add(txHash);
    globalClaimedTxHashes.add(txHash);
    claimedCount++;

    const playerToken = payment.gameData?.t || null;

    // Assign player 1 or player 2
    if (!game.player1Address) {
      await db.update(config.table).set({
        player1Address: playerAddress,
        player1TxHash: txHash,
        player1Token: playerToken,
        status: "waiting_p2",
        updatedAt: new Date(),
      }).where(eq(config.table.id, game.id));

      game.player1Address = playerAddress;
      game.player1TxHash = txHash;
      game.status = "waiting_p2";
    } else if (!game.player2Address && playerAddress !== game.player1Address?.toLowerCase()) {
      const extraFields = config.onBothPlayersPaid ? config.onBothPlayersPaid() : {};

      await db.update(config.table).set({
        player2Address: playerAddress,
        player2TxHash: txHash,
        player2Token: playerToken,
        status: config.activeStatus,
        updatedAt: new Date(),
        ...extraFields,
      }).where(eq(config.table.id, game.id));

      game.player2Address = playerAddress;
      game.player2TxHash = txHash;
      game.status = config.activeStatus;
    }
  }

  // Return fresh game state
  const [updated] = await db.select()
    .from(config.table)
    .where(eq(config.table.slug, slug))
    .limit(1);

  return { game: updated, newPayments: claimedCount };
}

// ─── LOBBY QUERY ───

export type LobbyRoom = {
  game: string;
  slug: string;
  betCrc: number;
  commissionPct: number;
  createdAt: Date;
};

export async function getLobbyGames(): Promise<LobbyRoom[]> {
  const queries = ALL_SERVER_GAMES.map(async (config) => {
    const rows = await db.select({
      slug: config.table.slug,
      betCrc: config.table.betCrc,
      commissionPct: config.table.commissionPct,
      createdAt: config.table.createdAt,
    })
      .from(config.table)
      .where(and(eq(config.table.status, "waiting_p2"), eq(config.table.isPrivate, false)))
      .orderBy(desc(config.table.createdAt))
      .limit(20);

    return rows.map((r: { slug: string; betCrc: number; commissionPct: number; createdAt: Date }) => ({
      ...r,
      game: config.key,
    }));
  });

  const results = await Promise.all(queries);
  return results.flat().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

// ─── PLAYER STATS ───

type HistoryEntry = {
  game: string;
  slug: string;
  opponent: string | null;
  result: "win" | "loss" | "draw";
  betCrc: number;
  date: string;
};

type GameStat = {
  game: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
};

export type PlayerStats = {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  totalBet: number;
  totalWon: number;
  byGame: GameStat[];
  history: HistoryEntry[];
};

function getResult(winnerAddr: string | null, me: string, gameResult?: string | null): "win" | "loss" | "draw" {
  if (gameResult === "draw") return "draw";
  if (!winnerAddr) return "draw";
  return winnerAddr.toLowerCase() === me ? "win" : "loss";
}

function getOpponent(p1: string | null, p2: string | null, me: string): string | null {
  return p1?.toLowerCase() === me ? p2 : p1;
}

export async function getPlayerStats(address: string): Promise<PlayerStats> {
  const addr = address.toLowerCase();

  // Query all game tables in parallel
  const queries = ALL_SERVER_GAMES.map(async (config) => {
    const rows = await db.select()
      .from(config.table)
      .where(
        and(
          eq(config.table.status, "finished"),
          or(
            eq(config.table.player1Address, addr),
            eq(config.table.player2Address, addr)
          )
        )
      )
      .orderBy(desc(config.table.updatedAt));

    return rows.map((g: Record<string, unknown>) => ({
      game: config.key,
      slug: g.slug as string,
      opponent: getOpponent(g.player1Address as string | null, g.player2Address as string | null, addr),
      result: getResult(g.winnerAddress as string | null, addr, g.result as string | null),
      betCrc: g.betCrc as number,
      date: (g.updatedAt as Date).toISOString(),
    }));
  });

  const results = await Promise.all(queries);
  const history: HistoryEntry[] = results.flat()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalGames = history.length;
  const wins = history.filter(h => h.result === "win").length;
  const losses = history.filter(h => h.result === "loss").length;
  const draws = history.filter(h => h.result === "draw").length;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const totalBet = history.reduce((s, h) => s + h.betCrc, 0);
  const totalWon = history.reduce((s, h) => s + (h.result === "win" ? h.betCrc * 2 : 0), 0);

  const byGame: GameStat[] = ALL_SERVER_GAMES
    .map(config => {
      const games = history.filter(h => h.game === config.key);
      const w = games.filter(h => h.result === "win").length;
      return {
        game: config.key,
        played: games.length,
        wins: w,
        losses: games.filter(h => h.result === "loss").length,
        draws: games.filter(h => h.result === "draw").length,
        winRate: games.length > 0 ? Math.round((w / games.length) * 100) : 0,
      };
    })
    .filter(g => g.played > 0);

  return {
    totalGames,
    wins,
    losses,
    draws,
    winRate,
    totalBet,
    totalWon,
    byGame,
    history: history.slice(0, 15),
  };
}
