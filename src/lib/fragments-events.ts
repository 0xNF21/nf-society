/**
 * Append-only ledger for Free-to-Play stakes and wins in Fragments.
 *
 * Feeds /stats when `real_stakes` is hidden. Existing game tables still keep
 * their historical CRC fields for compatibility.
 */

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { gameFragmentEvents } from "@/lib/db/schema";

export type FragmentEventType = "bet" | "win" | "loss" | "draw";

export type LogFragmentEventInput = {
  gameKey: string;
  gameSlug?: string | null;
  playerAddress?: string | null;
  playerToken?: string | null;
  eventType: FragmentEventType;
  amountFragments: number;
};

export async function logFragmentEvent(entry: LogFragmentEventInput): Promise<void> {
  if (!Number.isFinite(entry.amountFragments) || entry.amountFragments < 0) return;
  await db.insert(gameFragmentEvents).values({
    gameKey: entry.gameKey,
    gameSlug: entry.gameSlug ?? null,
    playerAddress: entry.playerAddress?.toLowerCase() ?? null,
    playerToken: entry.playerToken ?? null,
    eventType: entry.eventType,
    amountFragments: Math.round(entry.amountFragments),
  });
}

export async function getTotalWageredFragments(): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(${gameFragmentEvents.amountFragments}), 0)` })
    .from(gameFragmentEvents)
    .where(eq(gameFragmentEvents.eventType, "bet"));
  return Number(rows[0]?.total ?? 0);
}

export async function getTotalPaidOutFragments(): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(${gameFragmentEvents.amountFragments}), 0)` })
    .from(gameFragmentEvents)
    .where(eq(gameFragmentEvents.eventType, "win"));
  return Number(rows[0]?.total ?? 0);
}

export async function getFragmentStatsByGame(): Promise<
  Array<{ gameKey: string; wagered: number; paidOut: number; rounds: number }>
> {
  const rows = await db
    .select({
      gameKey: gameFragmentEvents.gameKey,
      eventType: gameFragmentEvents.eventType,
      total: sql<string>`COALESCE(SUM(${gameFragmentEvents.amountFragments}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(gameFragmentEvents)
    .groupBy(gameFragmentEvents.gameKey, gameFragmentEvents.eventType);

  const agg = new Map<string, { wagered: number; paidOut: number; rounds: number }>();
  for (const row of rows) {
    const key = row.gameKey;
    const bucket = agg.get(key) ?? { wagered: 0, paidOut: 0, rounds: 0 };
    const amount = Number(row.total);
    const count = Number(row.count);
    if (row.eventType === "bet") {
      bucket.wagered = amount;
      bucket.rounds = count;
    } else if (row.eventType === "win") {
      bucket.paidOut = amount;
    }
    agg.set(key, bucket);
  }
  return Array.from(agg.entries())
    .map(([gameKey, stats]) => ({ gameKey, ...stats }))
    .sort((a, b) => b.wagered - a.wagered);
}

export async function getDailyFragmentVolume30d(): Promise<
  Array<{ day: string; gameKey: string; wagered: number }>
> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      day: sql<string>`to_char(${gameFragmentEvents.createdAt}, 'YYYY-MM-DD')`,
      gameKey: gameFragmentEvents.gameKey,
      total: sql<string>`COALESCE(SUM(${gameFragmentEvents.amountFragments}), 0)`,
    })
    .from(gameFragmentEvents)
    .where(and(eq(gameFragmentEvents.eventType, "bet"), gte(gameFragmentEvents.createdAt, thirtyDaysAgo)))
    .groupBy(sql`to_char(${gameFragmentEvents.createdAt}, 'YYYY-MM-DD')`, gameFragmentEvents.gameKey)
    .orderBy(sql`to_char(${gameFragmentEvents.createdAt}, 'YYYY-MM-DD')`);
  return rows.map((r) => ({ day: r.day, gameKey: r.gameKey, wagered: Number(r.total) }));
}

export async function getTopPlayersByWageredFragments(limit = 10): Promise<
  Array<{ playerAddress: string; wagered: number; rounds: number }>
> {
  const rows = await db
    .select({
      playerAddress: gameFragmentEvents.playerAddress,
      wagered: sql<string>`COALESCE(SUM(${gameFragmentEvents.amountFragments}), 0)`,
      rounds: sql<string>`COUNT(*)`,
    })
    .from(gameFragmentEvents)
    .where(eq(gameFragmentEvents.eventType, "bet"))
    .groupBy(gameFragmentEvents.playerAddress)
    .orderBy(desc(sql`SUM(${gameFragmentEvents.amountFragments})`))
    .limit(limit);
  return rows
    .filter((r) => r.playerAddress)
    .map((r) => ({
      playerAddress: r.playerAddress as string,
      wagered: Number(r.wagered),
      rounds: Number(r.rounds),
    }));
}
