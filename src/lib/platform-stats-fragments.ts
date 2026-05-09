/**
 * Computes platform stats for Free-to-Play mode (Fragments events only).
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { daoFragmentsPool, gameFragmentEvents } from "@/lib/db/schema";

export type FragmentPlatformStats = {
  allTime: {
    rounds: number;
    players: number;
    wagered: number;
    paidOut: number;
  };
  daoPool: {
    totalFragments: number;
    last30dFragments: number;
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

export async function computeFragmentPlatformStats(): Promise<FragmentPlatformStats> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const betAgg = await db
    .select({
      total: sql<string>`COALESCE(SUM(${gameFragmentEvents.amountFragments}), 0)`,
      rounds: sql<string>`COUNT(*)`,
      players: sql<string>`COUNT(DISTINCT ${gameFragmentEvents.playerAddress})`,
    })
    .from(gameFragmentEvents)
    .where(eq(gameFragmentEvents.eventType, "bet"));
  const winAgg = await db
    .select({ total: sql<string>`COALESCE(SUM(${gameFragmentEvents.amountFragments}), 0)` })
    .from(gameFragmentEvents)
    .where(eq(gameFragmentEvents.eventType, "win"));

  const allTime = {
    rounds: Number(betAgg[0]?.rounds ?? 0),
    players: Number(betAgg[0]?.players ?? 0),
    wagered: Number(betAgg[0]?.total ?? 0),
    paidOut: Number(winAgg[0]?.total ?? 0),
  };

  const poolAll = await db
    .select({ total: sql<string>`COALESCE(SUM(${daoFragmentsPool.amountFragments}), 0)` })
    .from(daoFragmentsPool);
  const pool30d = await db
    .select({ total: sql<string>`COALESCE(SUM(${daoFragmentsPool.amountFragments}), 0)` })
    .from(daoFragmentsPool)
    .where(gte(daoFragmentsPool.createdAt, thirtyDaysAgo));

  const daoPool = {
    totalFragments: Number(poolAll[0]?.total ?? 0),
    last30dFragments: Number(pool30d[0]?.total ?? 0),
  };

  const rows = await db
    .select({
      gameKey: gameFragmentEvents.gameKey,
      eventType: gameFragmentEvents.eventType,
      total: sql<string>`COALESCE(SUM(${gameFragmentEvents.amountFragments}), 0)`,
      count: sql<string>`COUNT(*)`,
      players: sql<string>`COUNT(DISTINCT ${gameFragmentEvents.playerAddress})`,
    })
    .from(gameFragmentEvents)
    .groupBy(gameFragmentEvents.gameKey, gameFragmentEvents.eventType);

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

  const daily = await db
    .select({
      day: sql<string>`to_char(${gameFragmentEvents.createdAt}, 'YYYY-MM-DD')`,
      eventType: gameFragmentEvents.eventType,
      total: sql<string>`COALESCE(SUM(${gameFragmentEvents.amountFragments}), 0)`,
    })
    .from(gameFragmentEvents)
    .where(and(gte(gameFragmentEvents.createdAt, thirtyDaysAgo)))
    .groupBy(sql`to_char(${gameFragmentEvents.createdAt}, 'YYYY-MM-DD')`, gameFragmentEvents.eventType)
    .orderBy(sql`to_char(${gameFragmentEvents.createdAt}, 'YYYY-MM-DD')`);

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
