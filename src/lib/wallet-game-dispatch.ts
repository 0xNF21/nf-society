/**
 * Wallet → game dispatcher.
 *
 * When a player pays a game bet from their prepaid CRC balance (see
 * wallet.ts#payGameFromBalance), we need to mirror whatever the on-chain
 * scan route would have done: either assign them to a multiplayer slot,
 * or insert a fresh chance-game round with the right initial state.
 *
 * All functions here expect to run *inside* a db.transaction() handle so
 * that the debit, the ledger row, and the game-side write commit together.
 * A synthetic tx hash of the form `balance:{ledgerId}` is passed through
 * to satisfy the NOT NULL constraint on the various transactionHash columns;
 * existing on-chain scan code guards against re-claiming these via the
 * `if (!game.player1Address)` / txHash unique checks.
 */

import { eq, and, isNull } from "drizzle-orm";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { getServerGameConfig } from "@/lib/game-registry-server";
import {
  rouletteTables, rouletteRounds,
  hiloTables, hiloRounds,
  plinkoTables, plinkoRounds,
  minesTables, minesRounds,
  diceTables, diceRounds,
  crashDashTables, crashDashRounds,
  kenoTables, kenoRounds,
  blackjackTables, blackjackHands,
  coinFlipTables, coinFlipResults,
  lootboxes, lootboxOpens,
  lotteries, participants,
} from "@/lib/db/schema";

import { createInitialState as rouletteInitState } from "@/lib/roulette";
import { createDeck, dealInitialCard } from "@/lib/hilo";
import { createInitialState as plinkoInitState } from "@/lib/plinko";
import { createGrid as minesCreateGrid, createInitialState as minesInitState } from "@/lib/mines";
import { createInitialState as diceInitState } from "@/lib/dice";
import { generateCrashPoint, createInitialState as crashInitState } from "@/lib/crash-dash";
import { createInitialState as kenoInitState } from "@/lib/keno";
import { createDeck as blackjackCreateDeck, dealInitialHands as blackjackDealInitial } from "@/lib/blackjack";
import { resolveCoinFlip, isValidChoice as isValidCoinChoice, type CoinSide } from "@/lib/coin-flip";
import { getRandomReward as getLootboxReward } from "@/lib/lootbox";

// drizzle's tx type — use any to avoid dragging in full schema relations.
type Tx = any;

/** Set of chance game keys that support pay-from-balance today. */
export const CHANCE_BALANCE_SUPPORTED = new Set([
  "roulette",
  "hilo",
  "plinko",
  "mines",
  "dice",
  "crash_dash",
  "keno",
  "blackjack",
  "coin_flip",
  "lootbox",
  "lottery",
]);

/**
 * Games resolved server-side at bet time (no separate action call to deal
 * cards, reveal a tile, etc.). The dispatcher flips the coin / rolls the
 * lootbox and returns `prizeCrc` alongside the inserted row — payGameFromBalance
 * credits that prize inside the SAME transaction so the bet debit, the row
 * insert, the prize credit, and the treasury mirror all commit together.
 */
export const INSTANT_RESOLVE_GAMES = new Set(["coin_flip", "lootbox"]);

/** Multi games that support pay-from-balance today — any game in GAME_SERVER_REGISTRY. */
export const MULTI_BALANCE_SUPPORTED = new Set([
  "morpion",
  "memory",
  "relics",
  "dames",
  "pfc",
  "crc-races",
]);

export type AssignMultiResult =
  | { role: "player1" | "player2"; gameRow: any }
  | { error: "not_found" | "wrong_bet" | "already_joined" | "already_full" };

/**
 * Assign an address to player1 or player2 of a multiplayer game.
 * Runs inside a transaction; uses atomic UPDATE...WHERE to prevent
 * two concurrent debits from racing onto the same slot.
 *
 * Validates:
 * - game exists
 * - amount matches game.betCrc (cannot overpay or underpay)
 * - caller is not already the other player
 * - game still has an open slot
 */
export async function assignMultiPlayer(
  tx: Tx,
  gameKey: string,
  slug: string,
  address: string,
  playerToken: string,
  amount: number,
  syntheticTxHash: string,
): Promise<AssignMultiResult> {
  const config = getServerGameConfig(gameKey);
  const addr = address.toLowerCase();
  const table = config.table;

  // Fetch current state for validation
  const [game] = await tx.select().from(table).where(eq(table.slug, slug)).limit(1);
  if (!game) return { error: "not_found" };
  if (game.betCrc !== amount) return { error: "wrong_bet" };

  // Slot 1 — only if empty
  if (!game.player1Address) {
    const updated = await tx
      .update(table)
      .set({
        player1Address: addr,
        player1TxHash: syntheticTxHash,
        player1Token: playerToken,
        status: "waiting_p2",
        updatedAt: new Date(),
      })
      .where(and(eq(table.id, game.id), isNull(table.player1Address)))
      .returning();
    if (updated.length === 0) return { error: "already_full" };
    return { role: "player1", gameRow: updated[0] };
  }

  // Slot 2 — only if empty and caller is not player1
  if (game.player1Address.toLowerCase() === addr) return { error: "already_joined" };
  if (!game.player2Address) {
    const extraFields = config.onBothPlayersPaid ? config.onBothPlayersPaid() : {};
    const updated = await tx
      .update(table)
      .set({
        player2Address: addr,
        player2TxHash: syntheticTxHash,
        player2Token: playerToken,
        status: config.activeStatus,
        updatedAt: new Date(),
        ...extraFields,
      })
      .where(and(eq(table.id, game.id), isNull(table.player2Address)))
      .returning();
    if (updated.length === 0) return { error: "already_full" };
    return { role: "player2", gameRow: updated[0] };
  }

  return { error: "already_full" };
}

export type CreateChanceRoundOpts = {
  /** Sub-params required by specific games. */
  ballValue?: number;  // plinko
  mineCount?: number;  // mines
  pickCount?: number;  // keno
  choice?: "heads" | "tails"; // coin_flip
};

export type CreateChanceRoundResult =
  | {
      id: number;
      tableId: number;
      gameRow: any;
      /** For instant-resolve games (coin_flip, lootbox): amount to credit back
       *  to the player as their prize. 0 on a loss. Undefined for regular
       *  chance games where the prize is paid later by the action route. */
      prizeCrc?: number;
    }
  | { error: "table_not_found" | "invalid_bet" | "invalid_param" | "unsupported" | "already_joined" };

/**
 * Insert a chance-game round row mirroring what {game}-scan would have
 * written on an on-chain payment. Validates the bet amount against the
 * table's betOptions, then calls the game's createInitialState.
 */
export async function createChanceRound(
  tx: Tx,
  gameKey: string,
  tableSlug: string,
  address: string,
  playerToken: string,
  amount: number,
  syntheticTxHash: string,
  opts: CreateChanceRoundOpts = {},
): Promise<CreateChanceRoundResult> {
  const addr = address.toLowerCase();

  switch (gameKey) {
    case "roulette": {
      const [table] = await tx.select().from(rouletteTables).where(eq(rouletteTables.slug, tableSlug)).limit(1);
      if (!table) return { error: "table_not_found" };
      const betOptions = (table.betOptions as number[]) || [];
      if (!betOptions.includes(amount)) return { error: "invalid_bet" };
      const state = rouletteInitState(amount);
      const [inserted] = await tx.insert(rouletteRounds).values({
        tableId: table.id,
        playerAddress: addr,
        transactionHash: syntheticTxHash,
        betCrc: amount,
        playerToken,
        gameState: state as unknown as Record<string, unknown>,
        status: state.status,
      }).returning({ id: rouletteRounds.id });
      return { id: inserted.id, tableId: table.id, gameRow: { ...inserted, gameState: state } };
    }

    case "hilo": {
      const [table] = await tx.select().from(hiloTables).where(eq(hiloTables.slug, tableSlug)).limit(1);
      if (!table) return { error: "table_not_found" };
      const betOptions = (table.betOptions as number[]) || [];
      if (!betOptions.includes(amount)) return { error: "invalid_bet" };
      const deck = createDeck(1);
      const state = dealInitialCard(deck, amount);
      const [inserted] = await tx.insert(hiloRounds).values({
        tableId: table.id,
        playerAddress: addr,
        transactionHash: syntheticTxHash,
        betCrc: amount,
        playerToken,
        gameState: state as unknown as Record<string, unknown>,
        status: state.status,
      }).returning({ id: hiloRounds.id });
      return { id: inserted.id, tableId: table.id, gameRow: { ...inserted, gameState: state } };
    }

    case "plinko": {
      const [table] = await tx.select().from(plinkoTables).where(eq(plinkoTables.slug, tableSlug)).limit(1);
      if (!table) return { error: "table_not_found" };
      const betOptions = (table.betOptions as number[]) || [];
      if (!betOptions.includes(amount)) return { error: "invalid_bet" };
      const ballValue = opts.ballValue;
      if (!ballValue || ballValue <= 0) return { error: "invalid_param" };
      const state = plinkoInitState(amount, ballValue);
      const [inserted] = await tx.insert(plinkoRounds).values({
        tableId: table.id,
        playerAddress: addr,
        transactionHash: syntheticTxHash,
        betCrc: amount,
        ballValue,
        playerToken,
        gameState: state as unknown as Record<string, unknown>,
        status: state.status,
      }).returning({ id: plinkoRounds.id });
      return { id: inserted.id, tableId: table.id, gameRow: { ...inserted, gameState: state } };
    }

    case "mines": {
      const [table] = await tx.select().from(minesTables).where(eq(minesTables.slug, tableSlug)).limit(1);
      if (!table) return { error: "table_not_found" };
      const betOptions = (table.betOptions as number[]) || [];
      const mineOptions = (table.mineOptions as number[]) || [];
      if (!betOptions.includes(amount)) return { error: "invalid_bet" };
      const mineCount = opts.mineCount;
      if (!mineCount || !mineOptions.includes(mineCount)) return { error: "invalid_param" };
      const grid = minesCreateGrid(mineCount);
      const state = minesInitState(grid, amount);
      const [inserted] = await tx.insert(minesRounds).values({
        tableId: table.id,
        playerAddress: addr,
        transactionHash: syntheticTxHash,
        betCrc: amount,
        mineCount,
        playerToken,
        gameState: state as unknown as Record<string, unknown>,
        status: state.status,
      }).returning({ id: minesRounds.id });
      return { id: inserted.id, tableId: table.id, gameRow: { ...inserted, gameState: state } };
    }

    case "dice": {
      const [table] = await tx.select().from(diceTables).where(eq(diceTables.slug, tableSlug)).limit(1);
      if (!table) return { error: "table_not_found" };
      const betOptions = (table.betOptions as number[]) || [];
      if (!betOptions.includes(amount)) return { error: "invalid_bet" };
      const state = diceInitState(amount);
      const [inserted] = await tx.insert(diceRounds).values({
        tableId: table.id,
        playerAddress: addr,
        transactionHash: syntheticTxHash,
        betCrc: amount,
        playerToken,
        gameState: state as unknown as Record<string, unknown>,
        status: state.status,
      }).returning({ id: diceRounds.id });
      return { id: inserted.id, tableId: table.id, gameRow: { ...inserted, gameState: state } };
    }

    case "crash_dash": {
      const [table] = await tx.select().from(crashDashTables).where(eq(crashDashTables.slug, tableSlug)).limit(1);
      if (!table) return { error: "table_not_found" };
      const betOptions = (table.betOptions as number[]) || [];
      if (!betOptions.includes(amount)) return { error: "invalid_bet" };
      const crashPoint = generateCrashPoint();
      const state = crashInitState(crashPoint, amount);
      const [inserted] = await tx.insert(crashDashRounds).values({
        tableId: table.id,
        playerAddress: addr,
        transactionHash: syntheticTxHash,
        betCrc: amount,
        playerToken,
        gameState: state as unknown as Record<string, unknown>,
        status: state.status,
        crashPoint,
      }).returning({ id: crashDashRounds.id });
      return { id: inserted.id, tableId: table.id, gameRow: { ...inserted, gameState: state } };
    }

    case "keno": {
      const [table] = await tx.select().from(kenoTables).where(eq(kenoTables.slug, tableSlug)).limit(1);
      if (!table) return { error: "table_not_found" };
      const betOptions = (table.betOptions as number[]) || [];
      if (!betOptions.includes(amount)) return { error: "invalid_bet" };
      // Keno tables have no explicit pickOptions column; the rules cap at
      // MAX_PICKS=10 and the UI enforces 1..10. Mirror that here rather than
      // reading a non-existent table column.
      const pickCount = opts.pickCount;
      if (!pickCount || pickCount < 1 || pickCount > 10) return { error: "invalid_param" };
      const state = kenoInitState(amount, pickCount);
      const [inserted] = await tx.insert(kenoRounds).values({
        tableId: table.id,
        playerAddress: addr,
        transactionHash: syntheticTxHash,
        betCrc: amount,
        pickCount,
        playerToken,
        gameState: state as unknown as Record<string, unknown>,
        status: state.status,
      }).returning({ id: kenoRounds.id });
      return { id: inserted.id, tableId: table.id, gameRow: { ...inserted, gameState: state } };
    }

    case "blackjack": {
      const [table] = await tx.select().from(blackjackTables).where(eq(blackjackTables.slug, tableSlug)).limit(1);
      if (!table) return { error: "table_not_found" };
      const betOptions = (table.betOptions as number[]) || [];
      if (!betOptions.includes(amount)) return { error: "invalid_bet" };
      const deck = blackjackCreateDeck();
      const state = blackjackDealInitial(deck, amount);
      // Natural blackjack / dealer BJ / push resolve on the initial deal.
      // Persist outcome + payout fields so history & admin views are accurate,
      // and return prizeCrc so payGameFromBalance credits the gain atomically.
      const resolved = state.status === "finished";
      const naturalOutcome = resolved ? (state.playerHands[0]?.outcome || null) : null;
      const naturalPayout = resolved ? state.totalPayout : null;
      const [inserted] = await tx.insert(blackjackHands).values({
        tableId: table.id,
        playerAddress: addr,
        transactionHash: syntheticTxHash,
        betCrc: amount,
        playerToken,
        gameState: state as unknown as Record<string, unknown>,
        status: state.status,
        outcome: naturalOutcome,
        payoutCrc: naturalPayout,
        payoutStatus: resolved && (naturalPayout || 0) > 0 ? "success" : "pending",
      }).returning({ id: blackjackHands.id });
      return {
        id: inserted.id,
        tableId: table.id,
        gameRow: { ...inserted, gameState: state },
        prizeCrc: resolved ? state.totalPayout : undefined,
      };
    }

    case "coin_flip": {
      // Instant-resolve: flip the coin server-side and record the result in
      // the same transaction. prizeCrc is returned so payGameFromBalance
      // credits the winner atomically with the bet debit + treasury mirror.
      const [table] = await tx.select().from(coinFlipTables).where(eq(coinFlipTables.slug, tableSlug)).limit(1);
      if (!table) return { error: "table_not_found" };
      const betOptions = (table.betOptions as number[]) || [];
      if (!betOptions.includes(amount)) return { error: "invalid_bet" };
      const choice = opts.choice;
      if (!choice || !isValidCoinChoice(choice)) return { error: "invalid_param" };

      const flip = resolveCoinFlip(choice, amount);
      const payoutStatus = flip.outcome === "win" ? "success" : "none";
      const [inserted] = await tx.insert(coinFlipResults).values({
        tableId: table.id,
        playerAddress: addr,
        transactionHash: syntheticTxHash,
        betCrc: amount,
        playerToken,
        playerChoice: flip.playerChoice,
        coinResult: flip.coinResult,
        outcome: flip.outcome,
        payoutCrc: flip.payoutCrc > 0 ? flip.payoutCrc : null,
        payoutStatus,
      }).returning({ id: coinFlipResults.id, createdAt: coinFlipResults.createdAt });

      return {
        id: inserted.id,
        tableId: table.id,
        gameRow: {
          id: inserted.id,
          tableId: table.id,
          playerAddress: addr,
          transactionHash: syntheticTxHash,
          betCrc: amount,
          playerToken,
          playerChoice: flip.playerChoice,
          coinResult: flip.coinResult,
          outcome: flip.outcome,
          payoutCrc: flip.payoutCrc > 0 ? flip.payoutCrc : null,
          payoutStatus,
          createdAt: inserted.createdAt,
        },
        prizeCrc: flip.payoutCrc,
      };
    }

    case "lootbox": {
      // Instant-resolve: open the box, insert the result, and return the
      // reward as prizeCrc. payGameFromBalance credits it atomically.
      const [lootbox] = await tx.select().from(lootboxes).where(eq(lootboxes.slug, tableSlug)).limit(1);
      if (!lootbox) return { error: "table_not_found" };
      if (lootbox.status !== "active") return { error: "invalid_bet" };
      if (lootbox.pricePerOpenCrc !== amount) return { error: "invalid_bet" };

      const rewardCrc = getLootboxReward(amount);
      const payoutStatus = rewardCrc > 0 ? "success" : "none";
      const openedAt = new Date();
      const [inserted] = await tx.insert(lootboxOpens).values({
        lootboxId: lootbox.id,
        playerAddress: addr,
        transactionHash: syntheticTxHash,
        playerToken,
        rewardCrc,
        payoutStatus,
        openedAt,
      }).returning({ id: lootboxOpens.id });

      return {
        id: inserted.id,
        tableId: lootbox.id,
        gameRow: {
          id: inserted.id,
          lootboxId: lootbox.id,
          playerAddress: addr,
          transactionHash: syntheticTxHash,
          playerToken,
          rewardCrc,
          payoutStatus,
          openedAt: openedAt.toISOString(),
        },
        prizeCrc: rewardCrc,
      };
    }

    case "lottery": {
      // Each address may only hold ONE ticket per lottery (unique index on
      // (lotteryId, address)). We explicitly check first for a friendlier error
      // message; the unique constraint is the real safeguard against races.
      const [lottery] = await tx.select().from(lotteries).where(eq(lotteries.slug, tableSlug)).limit(1);
      if (!lottery) return { error: "table_not_found" };
      if (lottery.status !== "active") return { error: "invalid_bet" };
      if (lottery.ticketPriceCrc !== amount) return { error: "invalid_bet" };

      const [existing] = await tx
        .select({ id: participants.id })
        .from(participants)
        .where(and(eq(participants.lotteryId, lottery.id), eq(participants.address, addr)))
        .limit(1);
      if (existing) return { error: "already_joined" };

      const [inserted] = await tx.insert(participants).values({
        lotteryId: lottery.id,
        address: addr,
        transactionHash: syntheticTxHash,
        playerToken,
        paidAt: new Date(),
      }).returning({ id: participants.id });
      return {
        id: inserted.id,
        tableId: lottery.id,
        gameRow: { id: inserted.id, lotteryId: lottery.id, address: addr },
      };
    }

    default:
      return { error: "unsupported" };
  }
}
