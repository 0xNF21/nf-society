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
import { claimedPayments, payouts, walletLedger, crcRacesGames, lotteries } from "@/lib/db/schema";
import { sql, gte, lt, and, eq, inArray } from "drizzle-orm";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";
import { aggregateAllChance, ALL_CHANCE_SERVER_GAMES, ChanceAggregate } from "@/lib/chance-registry-server";
import { getSafeCrcBalance } from "@/lib/payout";
import { getRecentGames, RecentGameRow } from "@/lib/recent-games";
import { DAO_TREASURY_ADDRESS } from "@/lib/wallet-ledger";

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
    innerCrc: string;          // en CRC (decimal string, 18 decimales converties)
    wrappedCrc: string;        // xCRC ERC20
    totalCrc: string;          // inner + wrapped
    playerBalancesCrc: string; // somme des balances joueurs (off-chain, hors treasury)
    updatedAt: string;         // ISO
  };

  // Volumes par periode (methode B)
  period24h: PeriodStats;
  period7d: PeriodStats;
  period30d: PeriodStats;
  allTime: PeriodStats;

  // Breakdown par jeu (30j)
  games: GameStatLine[];

  // Graph volume 30j — total + une ligne par jeu avec volume > 0 sur la periode
  // (tri par volume decroissant, tous jeux confondus multi + chance).
  daily30d: DailyVolumePoint[];
  chartGames: TopGameMeta[];

  // Historique des 100 dernieres parties (multi + chance confondus)
  recentGames: RecentGameRow[];
};

const MULTI_GAME_META: Record<string, { label: string; emoji: string; color: string }> = {
  morpion: { label: "Morpion", emoji: "❌⭕", color: "#251B9F" },
  memory: { label: "Memory", emoji: "🃏", color: "#EC4899" },
  relics: { label: "Relics", emoji: "⚓", color: "#10B981" },
  dames: { label: "Dames", emoji: "♟️", color: "#F59E0B" },
  pfc: { label: "Pierre-Feuille-Ciseaux", emoji: "✊", color: "#DC2626" },
  "crc-races": { label: "Courses CRC", emoji: "🏇", color: "#EA580C" },
  lottery: { label: "Loterie", emoji: "🎟️", color: "#A855F7" },
};

// gameTypes valides en plus des jeux multi standard (ALL_SERVER_GAMES).
// - crc-races : jeu multi mais hors GAME_SERVER_REGISTRY (schema jsonb players).
// - lottery   : chance mais passe par claimedPayments/walletLedger comme les multi.
const EXTRA_CLAIMED_MULTI = ["crc-races"] as const;
const EXTRA_CLAIMED_CHANCE = ["lottery"] as const;
const EXTRA_CLAIMED_GAMES = [...EXTRA_CLAIMED_MULTI, ...EXTRA_CLAIMED_CHANCE] as const;

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

/**
 * Agrege les paiements multi (union claimedPayments on-chain + walletLedger balance-pay).
 *
 * claimedPayments.amountCrc = mise de CHAQUE joueur (pas le pot). gameType = key du jeu multi.
 * walletLedger (kind='debit', amountCrc negatif) = mise payee depuis le solde.
 *
 * Une partie multi = 2 paiements (un par joueur). Donc :
 *   - wagered = SUM(amountCrc) des deux sources (total effectivement misé)
 *   - rounds  = COUNT(DISTINCT gameId/gameSlug) des deux sources (approximation :
 *               une partie mixte on-chain + balance peut etre comptee 2x, rare)
 *   - players = COUNT(DISTINCT address)  (joueurs uniques, dedup cross-source + cross-jeux fait ailleurs)
 */
export async function multiAggregate(since?: Date, until?: Date): Promise<{
  total: PeriodStats;
  byGame: Record<string, PeriodStats>;
  uniqueAddresses: Set<string>;
}> {
  const multiKeys = ALL_SERVER_GAMES.map((g) => g.key);
  const claimedKeys = [...multiKeys, ...EXTRA_CLAIMED_GAMES];
  const whereParts: any[] = [inArray(claimedPayments.gameType, claimedKeys)];
  if (since) whereParts.push(gte(claimedPayments.claimedAt, since));
  if (until) whereParts.push(lt(claimedPayments.claimedAt, until));
  const whereClause = whereParts.length === 1 ? whereParts[0] : and(...whereParts);

  // Source 1 : claimedPayments (on-chain)
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

  const addressRows = await db
    .select({ address: claimedPayments.playerAddress })
    .from(claimedPayments)
    .where(whereClause)
    .groupBy(claimedPayments.playerAddress);

  // Source 2 : walletLedger kind='debit' (paiement depuis le solde).
  // On restreint aux memes gameType que claimedKeys pour exclure les autres
  // chance games (deja comptes via aggregateAllChance) et les non-jeux (topup,
  // cashout, etc.).
  const ledgerParts: any[] = [
    eq(walletLedger.kind, "debit"),
    inArray(walletLedger.gameType, claimedKeys as unknown as string[]),
  ];
  if (since) ledgerParts.push(gte(walletLedger.createdAt, since));
  if (until) ledgerParts.push(lt(walletLedger.createdAt, until));
  const ledgerWhere = ledgerParts.length === 1 ? ledgerParts[0] : and(...ledgerParts);

  const ledgerWageredRows = await db
    .select({
      gameType: walletLedger.gameType,
      wagered: sql<number>`COALESCE(SUM(-${walletLedger.amountCrc}), 0)`,
      players: sql<number>`COUNT(DISTINCT ${walletLedger.address})`,
      rounds: sql<number>`COUNT(DISTINCT ${walletLedger.gameSlug})`,
    })
    .from(walletLedger)
    .where(ledgerWhere)
    .groupBy(walletLedger.gameType);

  const ledgerAddressRows = await db
    .select({ address: walletLedger.address })
    .from(walletLedger)
    .where(ledgerWhere)
    .groupBy(walletLedger.address);

  const uniqueAddresses = new Set<string>(addressRows.map((r) => r.address.toLowerCase()));
  for (const r of ledgerAddressRows) uniqueAddresses.add(r.address.toLowerCase());

  // Payouts par jeu (depuis payouts table)
  const paidParts: any[] = [inArray(payouts.gameType, claimedKeys)];
  if (since) paidParts.push(gte(payouts.createdAt, since));
  if (until) paidParts.push(lt(payouts.createdAt, until));
  const paidWhere = paidParts.length === 1 ? paidParts[0] : and(...paidParts);

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
  // Ajout des montants balance-pay. On additionne le wagered (exact) et les
  // players par jeu (approximation acceptable : pour une partie mixte ou les
  // deux joueurs sont distincts, COUNT DISTINCT est deja correct dans chaque
  // source). Les rounds sont reecrits plus bas via une dedup par slug pour
  // eviter de compter 2x une partie mixte on-chain + balance.
  for (const r of ledgerWageredRows) {
    if (!r.gameType) continue;
    const entry = byGame[r.gameType] ?? { wagered: 0, paidOut: 0, rounds: 0, players: 0, profit: 0 };
    entry.wagered += Number(r.wagered);
    entry.players += Number(r.players);
    byGame[r.gameType] = entry;
  }

  // Rounds exacts : COUNT DISTINCT slug sur l'union des 2 sources. Necessite
  // un JOIN sur chaque table de jeu pour resoudre claimedPayments.gameId -> slug,
  // puis union avec walletLedger.gameSlug.
  const multiGameConfigs: Array<{ key: string; table: any }> = [
    ...ALL_SERVER_GAMES.map((g) => ({ key: g.key, table: g.table })),
    { key: "crc-races", table: crcRacesGames },
    { key: "lottery", table: lotteries },
  ];
  await Promise.all(
    multiGameConfigs.map(async ({ key, table }) => {
      const slugs = new Set<string>();

      const onchainParts: any[] = [eq(claimedPayments.gameType, key)];
      if (since) onchainParts.push(gte(claimedPayments.claimedAt, since));
      if (until) onchainParts.push(lt(claimedPayments.claimedAt, until));
      const onchainRows = await db
        .select({ slug: table.slug })
        .from(claimedPayments)
        .innerJoin(table, eq(claimedPayments.gameId, table.id))
        .where(and(...onchainParts))
        .groupBy(table.slug);
      for (const r of onchainRows) if (r.slug) slugs.add(r.slug as string);

      const balanceParts: any[] = [
        eq(walletLedger.kind, "debit"),
        eq(walletLedger.gameType, key),
      ];
      if (since) balanceParts.push(gte(walletLedger.createdAt, since));
      if (until) balanceParts.push(lt(walletLedger.createdAt, until));
      const balanceRows = await db
        .select({ slug: walletLedger.gameSlug })
        .from(walletLedger)
        .where(and(...balanceParts))
        .groupBy(walletLedger.gameSlug);
      for (const r of balanceRows) if (r.slug) slugs.add(r.slug);

      if (slugs.size > 0) {
        const entry = byGame[key] ?? { wagered: 0, paidOut: 0, rounds: 0, players: 0, profit: 0 };
        entry.rounds = slugs.size;
        byGame[key] = entry;
      } else if (byGame[key]) {
        byGame[key].rounds = 0;
      }
    }),
  );

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
 * Retourne les points quotidiens + la liste de tous les jeux avec volume > 0
 * sur la periode, tries par volume decroissant (pour la legende du graph).
 */
async function computeDaily30d(): Promise<{ points: DailyVolumePoint[]; chartGames: TopGameMeta[] }> {
  const since = daysAgo(30);

  // Multi : deux queries — claimedPayments (on-chain) + walletLedger (balance-pay).
  // Filtre par claimedKeys (multi + crc-races + lottery) pour exclure les non-jeux
  // (shop_auth, nf_auth, nf_cashout, daily-*, blackjack-refunded, etc.) et
  // eviter le double-comptage avec les chance games (ex: "lootbox" ici vs
  // "lootboxes" via chance-registry — ce dernier reste source de verite).
  const claimedKeys = [...ALL_SERVER_GAMES.map((g) => g.key), ...EXTRA_CLAIMED_GAMES];
  const multiDailyOnchainPromise = db
    .select({
      day: sql<string>`TO_CHAR(DATE_TRUNC('day', ${claimedPayments.claimedAt}), 'YYYY-MM-DD')`,
      game: claimedPayments.gameType,
      vol: sql<number>`COALESCE(SUM(${claimedPayments.amountCrc}), 0)`,
    })
    .from(claimedPayments)
    .where(and(gte(claimedPayments.claimedAt, since), inArray(claimedPayments.gameType, claimedKeys)))
    .groupBy(
      sql`DATE_TRUNC('day', ${claimedPayments.claimedAt})`,
      claimedPayments.gameType
    );

  const multiDailyBalancePromise = db
    .select({
      day: sql<string>`TO_CHAR(DATE_TRUNC('day', ${walletLedger.createdAt}), 'YYYY-MM-DD')`,
      game: walletLedger.gameType,
      vol: sql<number>`COALESCE(SUM(-${walletLedger.amountCrc}), 0)`,
    })
    .from(walletLedger)
    .where(and(
      gte(walletLedger.createdAt, since),
      eq(walletLedger.kind, "debit"),
      inArray(walletLedger.gameType, claimedKeys as unknown as string[]),
    ))
    .groupBy(
      sql`DATE_TRUNC('day', ${walletLedger.createdAt})`,
      walletLedger.gameType
    );

  // Chance : 1 query par jeu (en parallele)
  const chanceDailyPromise = Promise.all(
    ALL_CHANCE_SERVER_GAMES.map(async (cfg) => ({
      cfg,
      rows: await cfg.getDailyVolume(since),
    }))
  );

  const [multiDailyOnchain, multiDailyBalance, chanceDaily] = await Promise.all([
    multiDailyOnchainPromise,
    multiDailyBalancePromise,
    chanceDailyPromise,
  ]);

  // Build perDay[day][gameKey] = volume
  const perDay: Record<string, Record<string, number>> = {};

  for (const row of multiDailyOnchain) {
    if (!perDay[row.day]) perDay[row.day] = {};
    perDay[row.day][row.game] = (perDay[row.day][row.game] ?? 0) + Number(row.vol);
  }
  for (const row of multiDailyBalance) {
    if (!row.game) continue;
    if (!perDay[row.day]) perDay[row.day] = {};
    perDay[row.day][row.game] = (perDay[row.day][row.game] ?? 0) + Number(row.vol);
  }
  for (const { cfg, rows } of chanceDaily) {
    for (const r of rows) {
      if (!perDay[r.day]) perDay[r.day] = {};
      perDay[r.day][cfg.key] = r.wagered;
    }
  }

  // Totaux par jeu sur la periode — une ligne pour chaque jeu avec volume > 0,
  // tries par volume decroissant (le plus volumineux en premier dans la legende).
  const totalByGame: Record<string, number> = {};
  for (const day of Object.values(perDay)) {
    for (const [k, v] of Object.entries(day)) {
      totalByGame[k] = (totalByGame[k] ?? 0) + v;
    }
  }
  const activeKeys = Object.entries(totalByGame)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);

  const chartGames: TopGameMeta[] = activeKeys.map((key) => {
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

  return { points, chartGames };
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
    // Lottery passe par claimedPayments comme les multi mais reste un jeu de hasard.
    // crc-races reste un jeu multi.
    const isChanceExtra = (EXTRA_CLAIMED_CHANCE as readonly string[]).includes(key);
    lines.push({
      key,
      label: meta.label,
      emoji: meta.emoji,
      category: isChanceExtra ? "chance" : "multi",
      wagered: stats.wagered,
      paidOut: stats.paidOut,
      rounds: stats.rounds,
      // Pas de RTP pour la lottery : les jackpots peuvent depasser les ventes
      // (cumul entre tirages, sponsoring), donc le ratio n'est pas representatif.
      rtp: isChanceExtra ? null : (stats.wagered > 0 ? (stats.paidOut / stats.wagered) * 100 : null),
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
async function getPlayerBalancesCrc(): Promise<number> {
  try {
    const res = await db.execute(
      sql`SELECT COALESCE(SUM(balance_crc), 0)::float AS total
          FROM players
          WHERE balance_crc > 0
            AND lower(address) <> ${DAO_TREASURY_ADDRESS}`,
    );
    const row = (res as any).rows?.[0] ?? (res as any)[0] ?? { total: 0 };
    return Number(row.total) || 0;
  } catch (err) {
    console.error("[platform-stats] player balances fetch failed:", err);
    return 0;
  }
}

async function getCasinoBank(): Promise<PlatformStats["casinoBank"]> {
  try {
    const [balance, playerBalancesCrc] = await Promise.all([
      getSafeCrcBalance(),
      getPlayerBalancesCrc(),
    ]);
    const inner = ethers.formatUnits(balance.erc1155, 18);
    const wrapped = ethers.formatUnits(balance.erc20, 18);
    const total = ethers.formatUnits(balance.erc1155 + balance.erc20, 18);
    return {
      innerCrc: inner,
      wrappedCrc: wrapped,
      totalCrc: total,
      playerBalancesCrc: playerBalancesCrc.toFixed(6),
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[platform-stats] casino bank fetch failed:", err);
    return {
      innerCrc: "0",
      wrappedCrc: "0",
      totalCrc: "0",
      playerBalancesCrc: "0",
      updatedAt: new Date().toISOString(),
    };
  }
}

/**
 * Entry point: agrege tout en parallele.
 */
export async function computePlatformStats(): Promise<PlatformStats> {
  const [casinoBank, period24h, period7d, period30d, allTime, games, dailyData, recentGames] = await Promise.all([
    getCasinoBank(),
    computePeriodStats(daysAgo(1)),
    computePeriodStats(daysAgo(7)),
    computePeriodStats(daysAgo(30)),
    computePeriodStats(),
    computeGamesBreakdown(),
    computeDaily30d(),
    getRecentGames(100),
  ]);

  return {
    casinoBank,
    period24h,
    period7d,
    period30d,
    allTime,
    games,
    daily30d: dailyData.points,
    chartGames: dailyData.chartGames,
    recentGames,
  };
}
