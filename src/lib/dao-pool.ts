/**
 * Pot communautaire XP du DAO NF Society.
 *
 * En mode Free-to-Play, les 5% de commission des jeux multijoueurs + le
 * house edge des jeux chance sont accumules ici en XP virtuels. Zero revenu
 * reel — c'est une metrique de gamification affichee sur /dashboard-dao.
 *
 * Usage futur du pot : tournois avec recompenses XP, distribution mensuelle
 * aux top players, boosts d'XP pour membres actifs. A decider au fil de l'eau.
 */

import { db } from "@/lib/db";
import { daoXpPool } from "@/lib/db/schema";
import { desc, gte, sql } from "drizzle-orm";

export type DaoPoolSource = "commission_multiplayer" | "house_edge_chance" | "other";

export type DaoPoolEntry = {
  source: DaoPoolSource;
  gameKey?: string | null;
  amountXp: number;
};

/**
 * Credite le pot DAO d'un montant XP.
 * Append-only : chaque appel insere une nouvelle ligne, pas d'update.
 * A appeler a chaque fin de partie en mode F2P (multi et chance).
 */
export async function creditDaoPool(entry: DaoPoolEntry): Promise<void> {
  if (!Number.isFinite(entry.amountXp) || entry.amountXp <= 0) return;
  await db.insert(daoXpPool).values({
    source: entry.source,
    gameKey: entry.gameKey ?? null,
    amountXp: Math.round(entry.amountXp),
  });
}

/** Total cumule de XP dans le pot (depuis le lancement du mode F2P). */
export async function getDaoPoolTotal(): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(${daoXpPool.amountXp}), 0)` })
    .from(daoXpPool);
  return Number(rows[0]?.total ?? 0);
}

/** Total XP accumule sur les 30 derniers jours. */
export async function getDaoPoolLast30d(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(${daoXpPool.amountXp}), 0)` })
    .from(daoXpPool)
    .where(gte(daoXpPool.createdAt, thirtyDaysAgo));
  return Number(rows[0]?.total ?? 0);
}

/** Contributions par jeu (top jeux generant du pot DAO). */
export async function getDaoPoolByGame(limit = 10): Promise<Array<{ gameKey: string; totalXp: number }>> {
  const rows = await db
    .select({
      gameKey: daoXpPool.gameKey,
      totalXp: sql<string>`COALESCE(SUM(${daoXpPool.amountXp}), 0)`,
    })
    .from(daoXpPool)
    .groupBy(daoXpPool.gameKey)
    .orderBy(desc(sql`SUM(${daoXpPool.amountXp})`))
    .limit(limit);
  return rows
    .filter((r) => r.gameKey)
    .map((r) => ({ gameKey: r.gameKey as string, totalXp: Number(r.totalXp) }));
}
