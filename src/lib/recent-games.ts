/**
 * Recent games history — last N finished games across all multi + chance.
 * One row per game (not per player).
 *
 * Data shape is normalized so the client can render a single table with a filter.
 */

import { db } from "@/lib/db";
import { desc, eq, ne } from "drizzle-orm";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";
import { ALL_CHANCE_SERVER_GAMES } from "@/lib/chance-registry-server";
import {
  lootboxes,
  lootboxOpens,
  blackjackHands,
  coinFlipResults,
  hiloRounds,
  minesRounds,
  diceRounds,
  crashDashRounds,
  kenoRounds,
  rouletteRounds,
  plinkoRounds,
} from "@/lib/db/schema";

export type RecentGameRow = {
  key: string;
  label: string;
  emoji: string;
  category: "multi" | "chance";
  playerAddress: string;
  opponentAddress: string | null;   // multi only, null for chance/solo
  betCrc: number;
  payoutCrc: number;                // 0 if loss
  outcome: "win" | "loss" | "draw";
  createdAt: string;                // ISO
  txHash: string | null;
};

const MULTI_META: Record<string, { label: string; emoji: string }> = {
  morpion: { label: "Morpion", emoji: "❌⭕" },
  memory: { label: "Memory", emoji: "🃏" },
  relics: { label: "Relics", emoji: "⚓" },
  dames: { label: "Dames", emoji: "♟️" },
  pfc: { label: "Pierre-Feuille-Ciseaux", emoji: "✊" },
};

// Over-fetch per source so the merged top-N is accurate.
const PER_SOURCE_LIMIT = 120;

async function fetchMultiRows(): Promise<RecentGameRow[]> {
  const perGame = await Promise.all(
    ALL_SERVER_GAMES.map(async (cfg) => {
      const meta = MULTI_META[cfg.key] ?? { label: cfg.key, emoji: "🎮" };
      const rows = await db
        .select({
          updatedAt: cfg.table.updatedAt,
          createdAt: cfg.table.createdAt,
          betCrc: cfg.table.betCrc,
          commissionPct: cfg.table.commissionPct,
          player1Address: cfg.table.player1Address,
          player2Address: cfg.table.player2Address,
          winnerAddress: cfg.table.winnerAddress,
          payoutTxHash: cfg.table.payoutTxHash,
        })
        .from(cfg.table)
        .where(eq(cfg.table.status, "finished"))
        .orderBy(desc(cfg.table.updatedAt))
        .limit(PER_SOURCE_LIMIT);

      return rows.map((r: any): RecentGameRow => {
        const winner = (r.winnerAddress as string | null) || null;
        const p1 = (r.player1Address as string | null) || null;
        const p2 = (r.player2Address as string | null) || null;
        // Perspective: winner if any, else player1 (fallback player2).
        const perspective = winner ?? p1 ?? p2 ?? "";
        const opponent = perspective === p1 ? p2 : p1;
        const bet = Number(r.betCrc ?? 0);
        const pct = Number(r.commissionPct ?? 5);
        const pot = bet * 2;
        const fee = Math.floor((pot * pct) / 100);
        const winAmount = pot - fee;
        const when = (r.updatedAt as Date | null) ?? (r.createdAt as Date);
        return {
          key: cfg.key,
          label: meta.label,
          emoji: meta.emoji,
          category: "multi",
          playerAddress: perspective,
          opponentAddress: opponent,
          betCrc: bet,
          payoutCrc: winner ? winAmount : 0,
          outcome: winner ? "win" : "draw",
          createdAt: when instanceof Date ? when.toISOString() : new Date(when).toISOString(),
          txHash: (r.payoutTxHash as string | null) || null,
        };
      });
    })
  );
  return perGame.flat();
}

// Per-game config. `excludePlaying=true` skips rounds with status="playing"
// (interactive games where the bet is taken but payout not settled yet).
// Mirrors the filter applied in chance-registry-server.ts aggregates.
const CHANCE_TABLES: Record<string, { table: any; excludePlaying: boolean }> = {
  blackjack:  { table: blackjackHands,   excludePlaying: false },
  coin_flip:  { table: coinFlipResults,  excludePlaying: false },
  hilo:       { table: hiloRounds,       excludePlaying: true },
  mines:      { table: minesRounds,      excludePlaying: true },
  dice:       { table: diceRounds,       excludePlaying: true },
  crash_dash: { table: crashDashRounds,  excludePlaying: true },
  keno:       { table: kenoRounds,       excludePlaying: true },
  roulette:   { table: rouletteRounds,   excludePlaying: true },
  plinko:     { table: plinkoRounds,     excludePlaying: true },
};

async function fetchChanceStandardRows(
  cfg: { key: string; label: string; emoji: string },
  table: any,
  excludePlaying: boolean,
): Promise<RecentGameRow[]> {
  const query = db
    .select({
      playerAddress: table.playerAddress,
      betCrc: table.betCrc,
      payoutCrc: table.payoutCrc,
      createdAt: table.createdAt,
      payoutTxHash: table.payoutTxHash,
    })
    .from(table);
  const rows = await (excludePlaying
    ? query.where(ne(table.status, "playing"))
    : query
  )
    .orderBy(desc(table.createdAt))
    .limit(PER_SOURCE_LIMIT);

  return rows.map((r: any): RecentGameRow => {
    const bet = Number(r.betCrc ?? 0);
    const payout = Number(r.payoutCrc ?? 0);
    const outcome: RecentGameRow["outcome"] =
      payout > bet ? "win" : payout < bet ? "loss" : "draw";
    return {
      key: cfg.key,
      label: cfg.label,
      emoji: cfg.emoji,
      category: "chance",
      playerAddress: r.playerAddress as string,
      opponentAddress: null,
      betCrc: bet,
      payoutCrc: payout,
      outcome,
      createdAt: (r.createdAt as Date).toISOString(),
      txHash: (r.payoutTxHash as string | null) || null,
    };
  });
}

async function fetchLootboxRows(): Promise<RecentGameRow[]> {
  const rows = await db
    .select({
      playerAddress: lootboxOpens.playerAddress,
      price: lootboxes.pricePerOpenCrc,
      reward: lootboxOpens.rewardCrc,
      openedAt: lootboxOpens.openedAt,
      payoutTxHash: lootboxOpens.payoutTxHash,
    })
    .from(lootboxOpens)
    .innerJoin(lootboxes, eq(lootboxOpens.lootboxId, lootboxes.id))
    .orderBy(desc(lootboxOpens.openedAt))
    .limit(PER_SOURCE_LIMIT);

  return rows.map((r): RecentGameRow => {
    const bet = Number(r.price);
    const payout = Number(r.reward);
    const outcome: RecentGameRow["outcome"] =
      payout > bet ? "win" : payout < bet ? "loss" : "draw";
    return {
      key: "lootboxes",
      label: "Lootboxes",
      emoji: "🎁",
      category: "chance",
      playerAddress: r.playerAddress,
      opponentAddress: null,
      betCrc: bet,
      payoutCrc: payout,
      outcome,
      createdAt: r.openedAt.toISOString(),
      txHash: r.payoutTxHash || null,
    };
  });
}

export async function getRecentGames(limit = 100): Promise<RecentGameRow[]> {
  const chancePromises = ALL_CHANCE_SERVER_GAMES
    .filter((c) => c.key !== "lootboxes" && CHANCE_TABLES[c.key])
    .map((c) => {
      const { table, excludePlaying } = CHANCE_TABLES[c.key];
      return fetchChanceStandardRows(
        { key: c.key, label: c.label, emoji: c.emoji },
        table,
        excludePlaying,
      );
    });

  const [multi, chance, lootbox] = await Promise.all([
    fetchMultiRows(),
    Promise.all(chancePromises),
    fetchLootboxRows(),
  ]);

  const all = [...multi, ...chance.flat(), ...lootbox];
  all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return all.slice(0, limit);
}
