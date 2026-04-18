/**
 * Server-side chance games registry.
 *
 * Complementary to game-registry-server.ts (which covers multiplayer games).
 * Each entry here exposes two helpers :
 *   - getAggregate(since?)  -> wagered / paidOut / rounds / players
 *   - getPlayerStats(addr)  -> played / wagered / won / net / lastPlayedAt
 *
 * Any new chance game added here automatically shows up in :
 *   - /stats platform dashboard (volumes, RTP)
 *   - /player/[address] breakdown (history per game)
 *
 * Pattern "standard" = table with playerAddress / betCrc / payoutCrc / createdAt.
 * Non-standard games (lootboxes, lotteries) use custom configs.
 */

import { db } from "@/lib/db";
import {
  blackjackHands,
  coinFlipResults,
  hiloRounds,
  minesRounds,
  diceRounds,
  crashDashRounds,
  kenoRounds,
  rouletteRounds,
  plinkoRounds,
  lootboxes,
  lootboxOpens,
} from "@/lib/db/schema";
import { and, gte, eq, sql, desc } from "drizzle-orm";

export type ChanceAggregate = {
  wagered: number;     // CRC total mises
  paidOut: number;     // CRC total payes aux joueurs
  rounds: number;      // nombre de rounds
  players: number;     // joueurs uniques
};

export type ChancePlayerStats = {
  played: number;
  wagered: number;
  won: number;                       // total CRC recus par le joueur (peut etre 0)
  net: number;                       // won - wagered
  lastPlayedAt: Date | null;
};

export type DailyVolume = { day: string; wagered: number };

export type ChanceGameServerConfig = {
  key: string;
  label: string;
  emoji: string;
  accentColor: string;
  getAggregate(since?: Date): Promise<ChanceAggregate>;
  getPlayerStats(address: string): Promise<ChancePlayerStats>;
  // Liste des adresses joueurs distinctes sur la periode (pour dedup cross-games).
  getPlayerAddresses(since?: Date): Promise<string[]>;
  // Volume journalier (wagered) sur la periode donnee.
  getDailyVolume(since: Date): Promise<DailyVolume[]>;
};

/**
 * Factory pour le pattern "round standard" :
 * table avec colonnes playerAddress, betCrc, payoutCrc, createdAt.
 */
function createStandardConfig(opts: {
  key: string;
  label: string;
  emoji: string;
  accentColor: string;
  table: any;
  addressCol?: string;   // default "playerAddress"
  betCol?: string;       // default "betCrc"
  payoutCol?: string;    // default "payoutCrc"
  dateCol?: string;      // default "createdAt"
}): ChanceGameServerConfig {
  const {
    key, label, emoji, accentColor, table,
    addressCol = "playerAddress",
    betCol = "betCrc",
    payoutCol = "payoutCrc",
    dateCol = "createdAt",
  } = opts;

  const addressField = table[addressCol];
  const betField = table[betCol];
  const payoutField = table[payoutCol];
  const dateField = table[dateCol];

  return {
    key,
    label,
    emoji,
    accentColor,

    async getAggregate(since?: Date): Promise<ChanceAggregate> {
      const whereClause = since ? gte(dateField, since) : undefined;
      const [row] = await db
        .select({
          wagered: sql<number>`COALESCE(SUM(${betField}), 0)`,
          paidOut: sql<number>`COALESCE(SUM(${payoutField}), 0)`,
          rounds: sql<number>`COUNT(*)`,
          players: sql<number>`COUNT(DISTINCT ${addressField})`,
        })
        .from(table)
        .where(whereClause as any);

      return {
        wagered: Number(row?.wagered ?? 0),
        paidOut: Number(row?.paidOut ?? 0),
        rounds: Number(row?.rounds ?? 0),
        players: Number(row?.players ?? 0),
      };
    },

    async getPlayerStats(address: string): Promise<ChancePlayerStats> {
      const addr = address.toLowerCase();
      const [row] = await db
        .select({
          played: sql<number>`COUNT(*)`,
          wagered: sql<number>`COALESCE(SUM(${betField}), 0)`,
          won: sql<number>`COALESCE(SUM(${payoutField}), 0)`,
          lastAt: sql<Date | null>`MAX(${dateField})`,
        })
        .from(table)
        .where(sql`LOWER(${addressField}) = ${addr}`);

      const wagered = Number(row?.wagered ?? 0);
      const won = Number(row?.won ?? 0);
      return {
        played: Number(row?.played ?? 0),
        wagered,
        won,
        net: won - wagered,
        lastPlayedAt: row?.lastAt ? new Date(row.lastAt as any) : null,
      };
    },

    async getPlayerAddresses(since?: Date): Promise<string[]> {
      const whereClause = since ? gte(dateField, since) : undefined;
      const rows = await db
        .select({ addr: addressField })
        .from(table)
        .where(whereClause as any)
        .groupBy(addressField);
      return rows.map((r: any) => (r.addr as string).toLowerCase());
    },

    async getDailyVolume(since: Date): Promise<DailyVolume[]> {
      const rows = await db
        .select({
          day: sql<string>`TO_CHAR(DATE_TRUNC('day', ${dateField}), 'YYYY-MM-DD')`,
          wagered: sql<number>`COALESCE(SUM(${betField}), 0)`,
        })
        .from(table)
        .where(gte(dateField, since))
        .groupBy(sql`DATE_TRUNC('day', ${dateField})`);
      return rows.map((r) => ({ day: r.day, wagered: Number(r.wagered) }));
    },
  };
}

/* ═══════════════════════════════════════════════════
   REGISTRE
   ═══════════════════════════════════════════════════ */

const blackjackConfig = createStandardConfig({
  key: "blackjack", label: "Blackjack", emoji: "🎰", accentColor: "#1a7a3a",
  table: blackjackHands,
});

const coinFlipConfig = createStandardConfig({
  key: "coin_flip", label: "Pile ou Face", emoji: "🪙", accentColor: "#0EA5E9",
  table: coinFlipResults,
});

const hiloConfig = createStandardConfig({
  key: "hilo", label: "Hi-Lo", emoji: "🎴", accentColor: "#7C3AED",
  table: hiloRounds,
});

const minesConfig = createStandardConfig({
  key: "mines", label: "Mines", emoji: "💣", accentColor: "#DC2626",
  table: minesRounds,
});

const diceConfig = createStandardConfig({
  key: "dice", label: "Dice", emoji: "🎲", accentColor: "#F59E0B",
  table: diceRounds,
});

const crashDashConfig = createStandardConfig({
  key: "crash_dash", label: "Demurrage Dash", emoji: "🚀", accentColor: "#10B981",
  table: crashDashRounds,
});

const kenoConfig = createStandardConfig({
  key: "keno", label: "Keno", emoji: "🔢", accentColor: "#8B5CF6",
  table: kenoRounds,
});

const rouletteConfig = createStandardConfig({
  key: "roulette", label: "Roulette", emoji: "🎡", accentColor: "#B91C1C",
  table: rouletteRounds,
});

const plinkoConfig = createStandardConfig({
  key: "plinko", label: "Plinko", emoji: "🎯", accentColor: "#7C3AED",
  table: plinkoRounds,
});

/**
 * Lootboxes — cas special.
 * - bet = pricePerOpenCrc (via join sur lootboxes)
 * - payout = rewardCrc
 * - date = openedAt
 * - address = playerAddress
 */
const lootboxesConfig: ChanceGameServerConfig = {
  key: "lootboxes",
  label: "Lootboxes",
  emoji: "🎁",
  accentColor: "#F59E0B",

  async getAggregate(since?: Date): Promise<ChanceAggregate> {
    const whereClause = since ? gte(lootboxOpens.openedAt, since) : undefined;
    const [row] = await db
      .select({
        wagered: sql<number>`COALESCE(SUM(${lootboxes.pricePerOpenCrc}), 0)`,
        paidOut: sql<number>`COALESCE(SUM(${lootboxOpens.rewardCrc}), 0)`,
        rounds: sql<number>`COUNT(*)`,
        players: sql<number>`COUNT(DISTINCT ${lootboxOpens.playerAddress})`,
      })
      .from(lootboxOpens)
      .innerJoin(lootboxes, eq(lootboxOpens.lootboxId, lootboxes.id))
      .where(whereClause as any);

    return {
      wagered: Number(row?.wagered ?? 0),
      paidOut: Number(row?.paidOut ?? 0),
      rounds: Number(row?.rounds ?? 0),
      players: Number(row?.players ?? 0),
    };
  },

  async getPlayerStats(address: string): Promise<ChancePlayerStats> {
    const addr = address.toLowerCase();
    const [row] = await db
      .select({
        played: sql<number>`COUNT(*)`,
        wagered: sql<number>`COALESCE(SUM(${lootboxes.pricePerOpenCrc}), 0)`,
        won: sql<number>`COALESCE(SUM(${lootboxOpens.rewardCrc}), 0)`,
        lastAt: sql<Date | null>`MAX(${lootboxOpens.openedAt})`,
      })
      .from(lootboxOpens)
      .innerJoin(lootboxes, eq(lootboxOpens.lootboxId, lootboxes.id))
      .where(sql`LOWER(${lootboxOpens.playerAddress}) = ${addr}`);

    const wagered = Number(row?.wagered ?? 0);
    const won = Number(row?.won ?? 0);
    return {
      played: Number(row?.played ?? 0),
      wagered,
      won,
      net: won - wagered,
      lastPlayedAt: row?.lastAt ? new Date(row.lastAt as any) : null,
    };
  },

  async getPlayerAddresses(since?: Date): Promise<string[]> {
    const whereClause = since ? gte(lootboxOpens.openedAt, since) : undefined;
    const rows = await db
      .select({ addr: lootboxOpens.playerAddress })
      .from(lootboxOpens)
      .where(whereClause as any)
      .groupBy(lootboxOpens.playerAddress);
    return rows.map((r) => r.addr.toLowerCase());
  },

  async getDailyVolume(since: Date): Promise<DailyVolume[]> {
    const rows = await db
      .select({
        day: sql<string>`TO_CHAR(DATE_TRUNC('day', ${lootboxOpens.openedAt}), 'YYYY-MM-DD')`,
        wagered: sql<number>`COALESCE(SUM(${lootboxes.pricePerOpenCrc}), 0)`,
      })
      .from(lootboxOpens)
      .innerJoin(lootboxes, eq(lootboxOpens.lootboxId, lootboxes.id))
      .where(gte(lootboxOpens.openedAt, since))
      .groupBy(sql`DATE_TRUNC('day', ${lootboxOpens.openedAt})`);
    return rows.map((r) => ({ day: r.day, wagered: Number(r.wagered) }));
  },
};

export const CHANCE_SERVER_REGISTRY: Record<string, ChanceGameServerConfig> = {
  blackjack: blackjackConfig,
  coin_flip: coinFlipConfig,
  hilo: hiloConfig,
  mines: minesConfig,
  dice: diceConfig,
  crash_dash: crashDashConfig,
  keno: kenoConfig,
  roulette: rouletteConfig,
  plinko: plinkoConfig,
  lootboxes: lootboxesConfig,
};

export const ALL_CHANCE_SERVER_GAMES: ChanceGameServerConfig[] = Object.values(
  CHANCE_SERVER_REGISTRY
);

/**
 * Aggregate sur tous les jeux chance, en parallele.
 * `players` est deduplique cross-jeux via set d'adresses.
 */
export async function aggregateAllChance(since?: Date): Promise<
  ChanceAggregate & { byGame: Record<string, ChanceAggregate>; uniqueAddresses: Set<string> }
> {
  const [aggPairs, addressLists] = await Promise.all([
    Promise.all(
      ALL_CHANCE_SERVER_GAMES.map(async (cfg) => [cfg.key, await cfg.getAggregate(since)] as const)
    ),
    Promise.all(ALL_CHANCE_SERVER_GAMES.map((cfg) => cfg.getPlayerAddresses(since))),
  ]);

  const byGame: Record<string, ChanceAggregate> = {};
  let wagered = 0, paidOut = 0, rounds = 0;
  for (const [key, agg] of aggPairs) {
    byGame[key] = agg;
    wagered += agg.wagered;
    paidOut += agg.paidOut;
    rounds += agg.rounds;
  }

  const uniqueAddresses = new Set<string>();
  for (const list of addressLists) {
    for (const addr of list) uniqueAddresses.add(addr);
  }

  return { wagered, paidOut, rounds, players: uniqueAddresses.size, byGame, uniqueAddresses };
}

export async function getAllChancePlayerStats(
  address: string
): Promise<Record<string, ChancePlayerStats>> {
  const pairs = await Promise.all(
    ALL_CHANCE_SERVER_GAMES.map(async (cfg) => [cfg.key, await cfg.getPlayerStats(address)] as const)
  );
  return Object.fromEntries(pairs);
}
