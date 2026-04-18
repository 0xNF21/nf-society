/**
 * Platform-wide stats aggregator.
 *
 * Data sources:
 *   1. DB multi games : iterate GAME_SERVER_REGISTRY -> wagered/played
 *   2. DB chance games: iterate CHANCE_SERVER_REGISTRY -> wagered/paidOut/rounds
 *   3. On-chain       : getSafeCrcBalance() -> live "Banque casino"
 *
 * Totals are union of both (A) on-chain balance (live) and (B) DB cumul.
 */

import { ethers } from "ethers";
import { db } from "@/lib/db";
import { claimedPayments, payouts } from "@/lib/db/schema";
import { sql, gte, and, inArray } from "drizzle-orm";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";
import { aggregateAllChance, ALL_CHANCE_SERVER_GAMES, ChanceAggregate } from "@/lib/chance-registry-server";
import { getSafeCrcBalance } from "@/lib/payout";

export type PeriodStats = {
  wagered: number;
  paidOut: number;
  rounds: number;
  players: number;
  profit: number;  // wagered - paidOut (positif = banque gagne, negatif = banque paye plus)
};

export type GameStatLine = {
  key: string;
  label: string;
  emoji: string;
  category: "multi" | "chance";
  wagered: number;
  paidOut: number;
  rounds: number;
  rtp: number | null;  // % (paidOut / wagered) * 100. null si 0 misés
};

export type DailyVolumePoint = {
  date: string;       // ISO yyyy-mm-dd
  totalCrc: number;   // volume total ce jour
  perGame: Record<string, number>;  // volume par jeu ce jour (key -> CRC)
};

export type TopGameMeta = {
  key: string;
  label: string;
  emoji: string;
  color: string;  // hex
};

export type PlatformStats = {
  // Banque casino - on-chain (methode A)
  casinoBank: {
    innerCrc: string;   // en CRC (decimal string, 18 decimales converties)
    wrappedCrc: string; // xCRC ERC20
    totalCrc: string;   // inner + wrapped
    updatedAt: string;  // ISO
  };

  // Volumes par periode (methode B)
  period24h: PeriodStats;
  period7d: PeriodStats;
  period30d: PeriodStats;
  allTime: PeriodStats;

  // Breakdown par jeu (30j)
  games: GameStatLine[];

  // Graph volume 30j — total + top 5 jeux par volume sur la periode
  daily30d: DailyVolumePoint[];
  top5Games: TopGameMeta[];
};

const MULTI_GAME_META: Record<string, { label: string; emoji: string; color: string }> = {
  morpion: { label: "Morpion", emoji: "❌⭕", color: "#251B9F" },
  memory: { label: "Memory", emoji: "🃏", color: "#EC4899" },
  relics: { label: "Relics", emoji: "⚓", color: "#10B981" },
  dames: { label: "Dames", emoji: "♟️", color: "#F59E0B" },
  pfc: { label: "Pierre-Feuille-Ciseaux", emoji: "✊", color: "#DC2626" },
  "crc-races": { label: "Courses CRC", emoji: "🏇", color: "#EA580C" },
};

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Agrege les paiements multi (via claimedPayments).
 * claimedPayments.amountCrc = mise de CHAQUE joueur (pas le pot). gameType = key du jeu multi.
 * Une partie multi = 2 paiements (un par joueur). Donc :
 *   - wagered = SUM(amountCrc)           (total effectivement misé par les joueurs)
 *   - rounds  = COUNT(DISTINCT gameId)   (parties reelles)
 *   - players = COUNT(DISTINCT address)  (joueurs uniques par jeu, dedup cross-jeux fait ailleurs)
 */
async function multiAggregate(since?: Date): Promise<{
  total: PeriodStats;
  byGame: Record<string, PeriodStats>;
  uniqueAddresses: Set<string>;
}> {
  const multiKeys = ALL_SERVER_GAMES.map((g) => g.key);
  const whereClause = since
    ? and(gte(claimedPayments.claimedAt, since), inArray(claimedPayments.gameType, multiKeys))
    : inArray(claimedPayments.gameType, multiKeys);

  // Wagered par jeu + COUNT DISTINCT gameId pour avoir les vrais parties
  const wageredRows = await db
    .select({
      gameType: claimedPayments.gameType,
      wagered: sql<number>`COALESCE(SUM(${claimedPayments.amountCrc}), 0)`,
      players: sql<number>`COUNT(DISTINCT ${claimedPayments.playerAddress})`,
      rounds: sql<number>`COUNT(DISTINCT ${claimedPayments.gameId})`,
    })
    .from(claimedPayments)
    .where(whereClause)
    .groupBy(claimedPayments.gameType);

  // Collect toutes les adresses distinctes (pour dedup cross-jeux plus haut)
  const addressRows = await db
    .select({ address: claimedPayments.playerAddress })
    .from(claimedPayments)
    .where(whereClause)
    .groupBy(claimedPayments.playerAddress);

  const uniqueAddresses = new Set<string>(addressRows.map((r) => r.address.toLowerCase()));

  // Payouts par jeu (depuis payouts table)
  const paidWhere = since
    ? and(gte(payouts.createdAt, since), inArray(payouts.gameType, multiKeys))
    : inArray(payouts.gameType, multiKeys);

  const paidRows = await db
    .select({
      gameType: payouts.gameType,
      paidOut: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
    })
    .from(payouts)
    .where(paidWhere)
    .groupBy(payouts.gameType);

  const byGame: Record<string, PeriodStats> = {};
  for (const k of multiKeys) {
    byGame[k] = { wagered: 0, paidOut: 0, rounds: 0, players: 0, profit: 0 };
  }

  for (const r of wageredRows) {
    const entry = byGame[r.gameType] ?? { wagered: 0, paidOut: 0, rounds: 0, players: 0, profit: 0 };
    entry.wagered = Number(r.wagered);
    entry.rounds = Number(r.rounds);
    entry.players = Number(r.players);
    byGame[r.gameType] = entry;
  }
  for (const r of paidRows) {
    const entry = byGame[r.gameType] ?? { wagered: 0, paidOut: 0, rounds: 0, players: 0, profit: 0 };
    entry.paidOut = Number(r.paidOut);
    entry.profit = entry.wagered - entry.paidOut;
    byGame[r.gameType] = entry;
  }
  // recalc profit partout
  for (const k of Object.keys(byGame)) {
    byGame[k].profit = byGame[k].wagered - byGame[k].paidOut;
  }

  const total: PeriodStats = Object.values(byGame).reduce(
    (acc, g) => ({
      wagered: acc.wagered + g.wagered,
      paidOut: acc.paidOut + g.paidOut,
      rounds: acc.rounds + g.rounds,
      players: 0, // remplace apres par uniqueAddresses.size
      profit: acc.profit + g.profit,
    }),
    { wagered: 0, paidOut: 0, rounds: 0, players: 0, profit: 0 }
  );
  total.players = uniqueAddresses.size;

  return { total, byGame, uniqueAddresses };
}

async function chanceAggregate(since?: Date) {
  const data = await aggregateAllChance(since);
  const total: PeriodStats = {
    wagered: data.wagered,
    paidOut: data.paidOut,
    rounds: data.rounds,
    players: data.players,
    profit: data.wagered - data.paidOut,
  };
  const byGame: Record<string, PeriodStats> = {};
  for (const [k, v] of Object.entries(data.byGame)) {
    byGame[k] = {
      wagered: v.wagered,
      paidOut: v.paidOut,
      rounds: v.rounds,
      players: v.players,
      profit: v.wagered - v.paidOut,
    };
  }
  return { total, byGame, uniqueAddresses: data.uniqueAddresses };
}

async function computePeriodStats(since?: Date): Promise<PeriodStats> {
  const [multi, chance] = await Promise.all([
    multiAggregate(since),
    chanceAggregate(since),
  ]);
  // Dedup des joueurs uniques cross-jeux (multi + chance)
  const allPlayers = new Set<string>();
  for (const a of multi.uniqueAddresses) allPlayers.add(a);
  for (const a of chance.uniqueAddresses) allPlayers.add(a);

  return {
    wagered: multi.total.wagered + chance.total.wagered,
    paidOut: multi.total.paidOut + chance.total.paidOut,
    rounds: multi.total.rounds + chance.total.rounds,
    players: allPlayers.size,
    profit: multi.total.profit + chance.total.profit,
  };
}

/**
 * Volume journalier 30j avec breakdown complet par jeu (multi + chance).
 * Retourne les points quotidiens + les 5 jeux les plus actifs sur la periode.
 */
async function computeDaily30d(): Promise<{ points: DailyVolumePoint[]; top5: TopGameMeta[] }> {
  const since = daysAgo(30);

  // Multi : une seule query groupee day + game
  const multiDailyPromise = db
    .select({
      day: sql<string>`TO_CHAR(DATE_TRUNC('day', ${claimedPayments.claimedAt}), 'YYYY-MM-DD')`,
      game: claimedPayments.gameType,
      vol: sql<number>`COALESCE(SUM(${claimedPayments.amountCrc}), 0)`,
    })
    .from(claimedPayments)
    .where(gte(claimedPayments.claimedAt, since))
    .groupBy(
      sql`DATE_TRUNC('day', ${claimedPayments.claimedAt})`,
      claimedPayments.gameType
    );

  // Chance : 1 query par jeu (en parallele)
  const chanceDailyPromise = Promise.all(
    ALL_CHANCE_SERVER_GAMES.map(async (cfg) => ({
      cfg,
      rows: await cfg.getDailyVolume(since),
    }))
  );

  const [multiDaily, chanceDaily] = await Promise.all([multiDailyPromise, chanceDailyPromise]);

  // Build perDay[day][gameKey] = volume
  const perDay: Record<string, Record<string, number>> = {};

  for (const row of multiDaily) {
    if (!perDay[row.day]) perDay[row.day] = {};
    perDay[row.day][row.game] = Number(row.vol);
  }
  for (const { cfg, rows } of chanceDaily) {
    for (const r of rows) {
      if (!perDay[r.day]) perDay[r.day] = {};
      perDay[r.day][cfg.key] = r.wagered;
    }
  }

  // Totaux par jeu sur la periode pour identifier top 5
  const totalByGame: Record<string, number> = {};
  for (const day of Object.values(perDay)) {
    for (const [k, v] of Object.entries(day)) {
      totalByGame[k] = (totalByGame[k] ?? 0) + v;
    }
  }
  const top5keys = Object.entries(totalByGame)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);

  const top5: TopGameMeta[] = top5keys.map((key) => {
    // Multi game ?
    const multiMeta = MULTI_GAME_META[key];
    if (multiMeta) {
      return { key, label: multiMeta.label, emoji: multiMeta.emoji, color: multiMeta.color };
    }
    // Chance game
    const chanceCfg = ALL_CHANCE_SERVER_GAMES.find((c) => c.key === key);
    if (chanceCfg) {
      return { key, label: chanceCfg.label, emoji: chanceCfg.emoji, color: chanceCfg.accentColor };
    }
    return { key, label: key, emoji: "🎮", color: "#64748B" };
  });

  // Construit les 30 derniers jours en partant du plus ancien
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const points: DailyVolumePoint[] = days.map((day) => {
    const dayMap = perDay[day] ?? {};
    const total = Object.values(dayMap).reduce((a, b) => a + b, 0);
    return { date: day, totalCrc: total, perGame: dayMap };
  });

  return { points, top5 };
}

/**
 * Breakdown par jeu en ALL-TIME (pour la table).
 * On utilise toute l'historique (pas de filtre since) pour que le RTP
 * soit statistiquement pertinent meme sur les jeux peu joues.
 */
async function computeGamesBreakdown(): Promise<GameStatLine[]> {
  const [multi, chance] = await Promise.all([
    multiAggregate(),   // undefined = all time
    chanceAggregate(),
  ]);

  const lines: GameStatLine[] = [];

  for (const [key, stats] of Object.entries(multi.byGame)) {
    if (stats.rounds === 0) continue;
    const meta = MULTI_GAME_META[key] ?? { label: key, emoji: "🎮" };
    lines.push({
      key,
      label: meta.label,
      emoji: meta.emoji,
      category: "multi",
      wagered: stats.wagered,
      paidOut: stats.paidOut,
      rounds: stats.rounds,
      rtp: stats.wagered > 0 ? (stats.paidOut / stats.wagered) * 100 : null,
    });
  }

  for (const cfg of ALL_CHANCE_SERVER_GAMES) {
    const stats = chance.byGame[cfg.key];
    if (!stats || stats.rounds === 0) continue;
    lines.push({
      key: cfg.key,
      label: cfg.label,
      emoji: cfg.emoji,
      category: "chance",
      wagered: stats.wagered,
      paidOut: stats.paidOut,
      rounds: stats.rounds,
      rtp: stats.wagered > 0 ? (stats.paidOut / stats.wagered) * 100 : null,
    });
  }

  lines.sort((a, b) => b.wagered - a.wagered);
  return lines;
}

/**
 * Banque casino on-chain - somme CRC natif + xCRC wrapped du safe relayer.
 * Source de verite temps reel pour "combien la banque peut payer actuellement".
 */
async function getCasinoBank(): Promise<PlatformStats["casinoBank"]> {
  try {
    const balance = await getSafeCrcBalance();
    const inner = ethers.formatUnits(balance.erc1155, 18);
    const wrapped = ethers.formatUnits(balance.erc20, 18);
    const total = ethers.formatUnits(balance.erc1155 + balance.erc20, 18);
    return {
      innerCrc: inner,
      wrappedCrc: wrapped,
      totalCrc: total,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[platform-stats] casino bank fetch failed:", err);
    return {
      innerCrc: "0",
      wrappedCrc: "0",
      totalCrc: "0",
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Entry point: agrege tout en parallele.
 */
export async function computePlatformStats(): Promise<PlatformStats> {
  const [casinoBank, period24h, period7d, period30d, allTime, games, dailyData] = await Promise.all([
    getCasinoBank(),
    computePeriodStats(daysAgo(1)),
    computePeriodStats(daysAgo(7)),
    computePeriodStats(daysAgo(30)),
    computePeriodStats(),
    computeGamesBreakdown(),
    computeDaily30d(),
  ]);

  return {
    casinoBank,
    period24h,
    period7d,
    period30d,
    allTime,
    games,
    daily30d: dailyData.points,
    top5Games: dailyData.top5,
  };
}
