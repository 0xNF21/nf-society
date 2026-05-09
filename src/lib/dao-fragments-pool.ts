/**
 * DAO community pool accumulated in Fragments.
 */

import { desc, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { daoFragmentsPool } from "@/lib/db/schema";

export type DaoPoolSource = "commission_multiplayer" | "house_edge_chance" | "other";

export type DaoFragmentsPoolEntry = {
  source: DaoPoolSource;
  gameKey?: string | null;
  amountFragments: number;
};

export async function creditDaoFragmentsPool(entry: DaoFragmentsPoolEntry): Promise<void> {
  if (!Number.isFinite(entry.amountFragments) || entry.amountFragments <= 0) return;
  await db.insert(daoFragmentsPool).values({
    source: entry.source,
    gameKey: entry.gameKey ?? null,
    amountFragments: Math.round(entry.amountFragments),
  });
}

export async function getDaoFragmentsPoolTotal(): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(${daoFragmentsPool.amountFragments}), 0)` })
    .from(daoFragmentsPool);
  return Number(rows[0]?.total ?? 0);
}

export async function getDaoFragmentsPoolLast30d(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(${daoFragmentsPool.amountFragments}), 0)` })
    .from(daoFragmentsPool)
    .where(gte(daoFragmentsPool.createdAt, thirtyDaysAgo));
  return Number(rows[0]?.total ?? 0);
}

export async function getDaoFragmentsPoolByGame(limit = 10): Promise<Array<{ gameKey: string; totalFragments: number }>> {
  const rows = await db
    .select({
      gameKey: daoFragmentsPool.gameKey,
      totalFragments: sql<string>`COALESCE(SUM(${daoFragmentsPool.amountFragments}), 0)`,
    })
    .from(daoFragmentsPool)
    .groupBy(daoFragmentsPool.gameKey)
    .orderBy(desc(sql`SUM(${daoFragmentsPool.amountFragments})`))
    .limit(limit);
  return rows
    .filter((r) => r.gameKey)
    .map((r) => ({ gameKey: r.gameKey as string, totalFragments: Number(r.totalFragments) }));
}
