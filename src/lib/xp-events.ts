/**
 * Journal append-only des mises et gains XP pour les parties Free-to-Play.
 *
 * Alimente la nouvelle page /stats quand le flag `real_stakes` est sur `hidden`.
 * Ne touche pas les tables de jeux existantes (morpion_games, blackjack_hands, ...)
 * qui continuent de stocker l'historique CRC en clair.
 *
 * Chaque partie F2P produit 1 evenement `bet` par joueur + 1 evenement `win`
 * ou `loss` ou `draw` a la fin. La commission DAO (5%) va dans `dao_xp_pool`,
 * pas ici.
 */

import { db } from "@/lib/db";
import { gameXpEvents } from "@/lib/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export type XpEventType = "bet" | "win" | "loss" | "draw";

export type LogXpEventInput = {
  gameKey: string;
  gameSlug?: string | null;
  playerAddress?: string | null;
  playerToken?: string | null;
  eventType: XpEventType;
  amountXp: number;
};

/** Enregistre un evenement XP dans le journal. A appeler lors de la mise et du reglement. */
export async function logXpEvent(entry: LogXpEventInput): Promise<void> {
  if (!Number.isFinite(entry.amountXp) || entry.amountXp < 0) return;
  await db.insert(gameXpEvents).values({
    gameKey: entry.gameKey,
    gameSlug: entry.gameSlug ?? null,
    playerAddress: entry.playerAddress?.toLowerCase() ?? null,
    playerToken: entry.playerToken ?? null,
    eventType: entry.eventType,
    amountXp: Math.round(entry.amountXp),
  });
}

// ─── Queries pour la page /stats F2P ───────────────────────────────────

/** Volume total mise depuis le pivot (somme des events 'bet'). */
export async function getTotalWageredXp(): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(${gameXpEvents.amountXp}), 0)` })
    .from(gameXpEvents)
    .where(eq(gameXpEvents.eventType, "bet"));
  return Number(rows[0]?.total ?? 0);
}

/** Volume total paye en gains depuis le pivot (somme des events 'win'). */
export async function getTotalPaidOutXp(): Promise<number> {
  const rows = await db
    .select({ total: sql<string>`COALESCE(SUM(${gameXpEvents.amountXp}), 0)` })
    .from(gameXpEvents)
    .where(eq(gameXpEvents.eventType, "win"));
  return Number(rows[0]?.total ?? 0);
}

/** Stats par jeu : wagered, paidOut, rondes jouees. */
export async function getXpStatsByGame(): Promise<
  Array<{ gameKey: string; wagered: number; paidOut: number; rounds: number }>
> {
  const rows = await db
    .select({
      gameKey: gameXpEvents.gameKey,
      eventType: gameXpEvents.eventType,
      total: sql<string>`COALESCE(SUM(${gameXpEvents.amountXp}), 0)`,
      count: sql<string>`COUNT(*)`,
    })
    .from(gameXpEvents)
    .groupBy(gameXpEvents.gameKey, gameXpEvents.eventType);

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

/** Serie quotidienne sur les 30 derniers jours (volume mise par jour par jeu). */
export async function getDailyXpVolume30d(): Promise<
  Array<{ day: string; gameKey: string; wagered: number }>
> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      day: sql<string>`to_char(${gameXpEvents.createdAt}, 'YYYY-MM-DD')`,
      gameKey: gameXpEvents.gameKey,
      total: sql<string>`COALESCE(SUM(${gameXpEvents.amountXp}), 0)`,
    })
    .from(gameXpEvents)
    .where(and(eq(gameXpEvents.eventType, "bet"), gte(gameXpEvents.createdAt, thirtyDaysAgo)))
    .groupBy(sql`to_char(${gameXpEvents.createdAt}, 'YYYY-MM-DD')`, gameXpEvents.gameKey)
    .orderBy(sql`to_char(${gameXpEvents.createdAt}, 'YYYY-MM-DD')`);
  return rows.map((r) => ({ day: r.day, gameKey: r.gameKey, wagered: Number(r.total) }));
}

/** Top joueurs par XP mise depuis le pivot. */
export async function getTopPlayersByWageredXp(limit = 10): Promise<
  Array<{ playerAddress: string; wagered: number; rounds: number }>
> {
  const rows = await db
    .select({
      playerAddress: gameXpEvents.playerAddress,
      wagered: sql<string>`COALESCE(SUM(${gameXpEvents.amountXp}), 0)`,
      rounds: sql<string>`COUNT(*)`,
    })
    .from(gameXpEvents)
    .where(eq(gameXpEvents.eventType, "bet"))
    .groupBy(gameXpEvents.playerAddress)
    .orderBy(desc(sql`SUM(${gameXpEvents.amountXp})`))
    .limit(limit);
  return rows
    .filter((r) => r.playerAddress)
    .map((r) => ({
      playerAddress: r.playerAddress as string,
      wagered: Number(r.wagered),
      rounds: Number(r.rounds),
    }));
}
