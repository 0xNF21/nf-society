/**
 * Computes platform stats for Free-to-Play mode (XP events only).
 *
 * Similar shape to `computePlatformStats()` but reads exclusively from
 * `game_xp_events` and `dao_xp_pool`. The legacy CRC tables are ignored —
 * the page shown to players in F2P mode only counts post-pivot activity.
 */

import { db } from "@/lib/db";
import { gameXpEvents, daoXpPool } from "@/lib/db/schema";
import { sql, eq, and, gte } from "drizzle-orm";

export type XpPlatformStats = {
  allTime: {
    rounds: number;
    players: number;
    wagered: number;
    paidOut: number;
  };
  daoPool: {
    totalXp: number;
    last30dXp: number;
  };
  byGame: Array<{
    gameKey: string;
    wagered: number;
    paidOut: number;
    rounds: number;
    uniquePlayers: number;
  }>;
  daily30d: Array<{ day: string; wagered: number; paidOut: number }>;
};

export async function computeXpPlatformStats(): Promise<XpPlatformStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // ─── All-time aggregates ──────────────────────────────────────
  const betAgg = await db
    .select({
      total: sql<string>`COALESCE(SUM(${gameXpEvents.amountXp}), 0)`,
      rounds: sql<string>`COUNT(*)`,
      players: sql<string>`COUNT(DISTINCT ${gameXpEvents.playerAddress})`,
    })
    .from(gameXpEvents)
    .where(eq(gameXpEvents.eventType, "bet"));
  const winAgg = await db
    .select({ total: sql<string>`COALESCE(SUM(${gameXpEvents.amountXp}), 0)` })
    .from(gameXpEvents)
    .where(eq(gameXpEvents.eventType, "win"));

  const allTime = {
    rounds: Number(betAgg[0]?.rounds ?? 0),
    players: Number(betAgg[0]?.players ?? 0),
    wagered: Number(betAgg[0]?.total ?? 0),
    paidOut: Number(winAgg[0]?.total ?? 0),
  };

  // ─── DAO pool ─────────────────────────────────────────────────
  const poolAll = await db
    .select({ total: sql<string>`COALESCE(SUM(${daoXpPool.amountXp}), 0)` })
    .from(daoXpPool);
  const pool30d = await db
    .select({ total: sql<string>`COALESCE(SUM(${daoXpPool.amountXp}), 0)` })
    .from(daoXpPool)
    .where(gte(daoXpPool.createdAt, thirtyDaysAgo));

  const daoPool = {
    totalXp: Number(poolAll[0]?.total ?? 0),
    last30dXp: Number(pool30d[0]?.total ?? 0),
  };

  // ─── Per game ─────────────────────────────────────────────────
  const rows = await db
    .select({
      gameKey: gameXpEvents.gameKey,
      eventType: gameXpEvents.eventType,
      total: sql<string>`COALESCE(SUM(${gameXpEvents.amountXp}), 0)`,
      count: sql<string>`COUNT(*)`,
      players: sql<string>`COUNT(DISTINCT ${gameXpEvents.playerAddress})`,
    })
    .from(gameXpEvents)
    .groupBy(gameXpEvents.gameKey, gameXpEvents.eventType);

  const byGameMap = new Map<string, { wagered: number; paidOut: number; rounds: number; uniquePlayers: number }>();
  for (const row of rows) {
    const bucket = byGameMap.get(row.gameKey) ?? { wagered: 0, paidOut: 0, rounds: 0, uniquePlayers: 0 };
    const amount = Number(row.total);
    const count = Number(row.count);
    const players = Number(row.players);
    if (row.eventType === "bet") {
      bucket.wagered = amount;
      bucket.rounds = count;
      bucket.uniquePlayers = Math.max(bucket.uniquePlayers, players);
    } else if (row.eventType === "win") {
      bucket.paidOut = amount;
    }
    byGameMap.set(row.gameKey, bucket);
  }
  const byGame = Array.from(byGameMap.entries())
    .map(([gameKey, stats]) => ({ gameKey, ...stats }))
    .sort((a, b) => b.wagered - a.wagered);

  // ─── Daily volume (30d) — bet + win timelines ────────────────
  const daily = await db
    .select({
      day: sql<string>`to_char(${gameXpEvents.createdAt}, 'YYYY-MM-DD')`,
      eventType: gameXpEvents.eventType,
      total: sql<string>`COALESCE(SUM(${gameXpEvents.amountXp}), 0)`,
    })
    .from(gameXpEvents)
    .where(and(gte(gameXpEvents.createdAt, thirtyDaysAgo)))
    .groupBy(sql`to_char(${gameXpEvents.createdAt}, 'YYYY-MM-DD')`, gameXpEvents.eventType)
    .orderBy(sql`to_char(${gameXpEvents.createdAt}, 'YYYY-MM-DD')`);

  const dailyMap = new Map<string, { wagered: number; paidOut: number }>();
  for (const r of daily) {
    const bucket = dailyMap.get(r.day) ?? { wagered: 0, paidOut: 0 };
    if (r.eventType === "bet") bucket.wagered = Number(r.total);
    if (r.eventType === "win") bucket.paidOut = Number(r.total);
    dailyMap.set(r.day, bucket);
  }
  const daily30d = Array.from(dailyMap.entries())
    .map(([day, v]) => ({ day, ...v }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  return { allTime, daoPool, byGame, daily30d };
}
