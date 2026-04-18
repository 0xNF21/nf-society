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
  topGames: { key: string; volume: number }[];  // top 3 jeux ce jour
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

  // Graph volume 30j
  daily30d: DailyVolumePoint[];
};

const MULTI_GAME_META: Record<string, { label: string; emoji: string }> = {
  morpion: { label: "Morpion", emoji: "❌⭕" },
  memory: { label: "Memory", emoji: "🃏" },
  relics: { label: "Relics", emoji: "⚓" },
  dames: { label: "Dames", emoji: "♟️" },
  pfc: { label: "Pierre-Feuille-Ciseaux", emoji: "✊" },
  "crc-races": { label: "Courses CRC", emoji: "🏇" },
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
 * Volume journalier 30j, total + top 3 jeux par jour.
 */
async function computeDaily30d(): Promise<DailyVolumePoint[]> {
  const since = daysAgo(30);

  // Multi : claimedPayments group by day + game
  const multiDaily = await db
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

  // Chance : pour chaque jeu, query daily aggregate
  const chanceDailyPerGame = await Promise.all(
    ALL_CHANCE_SERVER_GAMES.map(async (cfg) => {
      // Ne pas hardcoder le nom de colonne date - on suppose createdAt ou openedAt
      // Hack temporaire : on fait une requete SQL via le helper unifie.
      // Pour simplifier, on passe par getAggregate day-by-day n'est pas scalable.
      // Compromis : on genere les 30 buckets cote app en iterant par jour.
      const perDay: Record<string, number> = {};
      for (let i = 0; i < 30; i++) {
        const start = new Date();
        start.setDate(start.getDate() - i);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);
        // Optimisation : on pourrait faire une query SQL groupBy, mais pour v1 ca suffit
        // car 12 jeux * 30 jours = 360 queries. Amelioration possible ensuite.
        // Pour eviter, on utilise getAggregate(since) et on soustrait
      }
      // Approche alternative : une seule query agregate 30j, pas de breakdown daily.
      // Pour avoir le daily, il faudrait un colonnage par date sur chaque table.
      // En v1 on simplifie : le chance apparait dans le total mais pas disagrege par jour.
      return { key: cfg.key, perDay };
    })
  );

  // Construit les 30 derniers jours en partant du plus ancien
  const days: string[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  // Agrege multi par jour
  const multiByDay: Record<string, Record<string, number>> = {};
  for (const row of multiDaily) {
    const day = row.day;
    if (!multiByDay[day]) multiByDay[day] = {};
    multiByDay[day][row.game] = Number(row.vol);
  }

  const points: DailyVolumePoint[] = days.map((day) => {
    const perGame = multiByDay[day] ?? {};
    const total = Object.values(perGame).reduce((a, b) => a + b, 0);
    const topGames = Object.entries(perGame)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([key, vol]) => ({ key, volume: vol }));
    return { date: day, totalCrc: total, topGames };
  });

  return points;
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
  const [casinoBank, period24h, period7d, period30d, allTime, games, daily30d] = await Promise.all([
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
    daily30d,
  };
}
