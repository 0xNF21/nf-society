/**
 * Free-to-play payment rail backed by Fragments.
 *
 * Game tables still store historical `betCrc` fields as a neutral stake unit.
 * This rail receives a CRC-reference amount, converts it to Fragments, and
 * debits/credits the player's playable balance. Chance-game starts can also
 * award their configured progression XP after the game row is created.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { daoFragmentsPool, gameFragmentEvents, players } from "@/lib/db/schema";
import { crcToFragments } from "@/lib/fragments";
import {
  assignCrcRacesPlayer,
  assignMultiPlayer,
  CHANCE_BALANCE_SUPPORTED,
  createChanceRound,
  INSTANT_RESOLVE_GAMES,
  MULTI_BALANCE_SUPPORTED,
} from "@/lib/wallet-game-dispatch";
import { getLootboxXpAction } from "@/lib/xp";
import { awardPlayerXp } from "@/lib/xp-server";

export type PayGameFromFragmentsParams = {
  address: string;
  gameKey: string;
  slug: string;
  amount: number; // CRC-reference stake; converted to Fragments.
  playerToken: string;
  extras?: {
    ballValue?: number;
    mineCount?: number;
    pickCount?: number;
    choice?: "heads" | "tails";
  };
};

export type PayGameFromFragmentsResult =
  | {
      ok: true;
      fragmentsAfter: number;
      family: "multi" | "chance";
      role?: "player1" | "player2" | "racer";
      gameRow?: any;
      roundId?: number;
      tableId?: number;
      prizeFragments?: number;
    }
  | {
      ok: false;
      error:
        | "invalid_address"
        | "invalid_amount"
        | "missing_player_token"
        | "unsupported_game"
        | "insufficient_fragments"
        | "not_found"
        | "wrong_bet"
        | "already_joined"
        | "already_full"
        | "invalid_state"
        | "invalid_param"
        | "table_not_found"
        | "internal_error";
    };

const HOUSE_COMMISSION_PCT = 5;
type PayGameFromFragmentsError = Extract<PayGameFromFragmentsResult, { ok: false }>["error"];

const PAY_GAME_FROM_FRAGMENTS_ERRORS = new Set<PayGameFromFragmentsError>([
  "invalid_address",
  "invalid_amount",
  "missing_player_token",
  "unsupported_game",
  "insufficient_fragments",
  "not_found",
  "wrong_bet",
  "already_joined",
  "already_full",
  "invalid_state",
  "invalid_param",
  "table_not_found",
  "internal_error",
]);

const CHANCE_PLAY_XP_ACTIONS: Record<string, string> = {
  roulette: "roulette_play",
  hilo: "hilo_play",
  plinko: "plinko_play",
  mines: "mines_play",
  dice: "dice_play",
  crash_dash: "crash_dash_play",
  keno: "keno_play",
  blackjack: "blackjack_play",
  coin_flip: "coin_flip_play",
};

async function awardFragmentsChanceXp(
  params: PayGameFromFragmentsParams,
  result: Extract<PayGameFromFragmentsResult, { ok: true }>,
  addr: string,
  amountCrc: number,
  amountFragments: number,
): Promise<void> {
  if (result.family !== "chance") return;

  if (params.gameKey === "lootbox") {
    const rewardCrc = Number(result.gameRow?.rewardCrc ?? 0);
    const sourceId = `open:${result.roundId}`;
    const metadata = {
      rail: "fragments",
      slug: params.slug,
      lootboxId: result.tableId,
      rewardCrc,
      stakeCrc: amountCrc,
      stakeFragments: amountFragments,
    };

    try {
      const openResult = await awardPlayerXp({
        address: addr,
        action: "lootbox_open",
        sourceType: "lootbox",
        sourceId,
        metadata,
      });
      if ("error" in openResult) {
        console.error("[wallet-fragments] lootbox open XP award skipped:", openResult.error);
      }

      const bonusAction = getLootboxXpAction(rewardCrc, amountCrc);
      if (bonusAction) {
        const bonusResult = await awardPlayerXp({
          address: addr,
          action: bonusAction,
          sourceType: "lootbox",
          sourceId,
          metadata,
        });
        if ("error" in bonusResult) {
          console.error("[wallet-fragments] lootbox bonus XP award skipped:", bonusResult.error);
        }
      }
    } catch (err) {
      console.error("[wallet-fragments] lootbox XP award failed:", err);
    }
    return;
  }

  const action = CHANCE_PLAY_XP_ACTIONS[params.gameKey];
  if (!action || !result.roundId) return;

  try {
    const xpResult = await awardPlayerXp({
      address: addr,
      action,
      sourceType: params.gameKey,
      sourceId: `fragments:${params.gameKey}:${result.roundId}`,
      metadata: {
        rail: "fragments",
        slug: params.slug,
        tableId: result.tableId,
        stakeCrc: amountCrc,
        stakeFragments: amountFragments,
      },
    });

    if ("error" in xpResult) {
      console.error("[wallet-fragments] play XP award skipped:", {
        gameKey: params.gameKey,
        action,
        error: xpResult.error,
      });
    }
  } catch (err) {
    console.error("[wallet-fragments] play XP award failed:", err);
  }
}

function normalizePayGameError(error: string): PayGameFromFragmentsError {
  if (error === "invalid_bet") return "wrong_bet";
  if (PAY_GAME_FROM_FRAGMENTS_ERRORS.has(error as PayGameFromFragmentsError)) {
    return error as PayGameFromFragmentsError;
  }
  return "internal_error";
}

export async function payGameFromFragments(params: PayGameFromFragmentsParams): Promise<PayGameFromFragmentsResult> {
  const addr = params.address.trim().toLowerCase();
  if (!addr || !/^0x[a-f0-9]{40}$/.test(addr)) {
    return { ok: false, error: "invalid_address" };
  }
  if (!params.amount || params.amount <= 0 || !Number.isFinite(params.amount)) {
    return { ok: false, error: "invalid_amount" };
  }
  if (!params.playerToken) {
    return { ok: false, error: "missing_player_token" };
  }

  const isMulti = MULTI_BALANCE_SUPPORTED.has(params.gameKey);
  const isChance = CHANCE_BALANCE_SUPPORTED.has(params.gameKey);
  if (!isMulti && !isChance) {
    return { ok: false, error: "unsupported_game" };
  }

  const amountCrc = params.amount;
  const amountFragments = crcToFragments(amountCrc);
  if (amountFragments <= 0) {
    return { ok: false, error: "invalid_amount" };
  }

  try {
    const result = await db.transaction<PayGameFromFragmentsResult>(async (tx) => {
      const debit = await tx.execute<{ fragments_balance: number }>(
        sql`UPDATE players
            SET fragments_balance = fragments_balance - ${amountFragments},
                fragments_spent = fragments_spent + ${amountFragments},
                last_seen = NOW()
            WHERE address = ${addr} AND fragments_balance >= ${amountFragments}
            RETURNING fragments_balance`,
      );
      const debitRow = (debit as any).rows?.[0] ?? (debit as any)[0];
      if (!debitRow) return { ok: false as const, error: "insufficient_fragments" };

      const fragmentsAfterDebit = Number(debitRow.fragments_balance);
      if (!Number.isFinite(fragmentsAfterDebit)) {
        return { ok: false as const, error: "insufficient_fragments" };
      }

      const [betEvent] = await tx
        .insert(gameFragmentEvents)
        .values({
          gameKey: params.gameKey,
          gameSlug: params.slug,
          playerAddress: addr,
          playerToken: params.playerToken,
          eventType: "bet",
          amountFragments,
        })
        .returning({ id: gameFragmentEvents.id });

      const syntheticTxHash = `fragments:${betEvent.id}`;

      if (isMulti) {
        const result = params.gameKey === "crc-races"
          ? await assignCrcRacesPlayer(tx, params.slug, addr, params.playerToken, amountCrc, syntheticTxHash)
          : await assignMultiPlayer(tx, params.gameKey, params.slug, addr, params.playerToken, amountCrc, syntheticTxHash);
        if ("error" in result) throw new Error(`multi:${result.error}`);
        return {
          ok: true as const,
          fragmentsAfter: fragmentsAfterDebit,
          family: "multi" as const,
          role: result.role,
          gameRow: result.gameRow,
        };
      }

      const result = await createChanceRound(
        tx,
        params.gameKey,
        params.slug,
        addr,
        params.playerToken,
        amountCrc,
        syntheticTxHash,
        params.extras || {},
      );
      if ("error" in result) throw new Error(`chance:${normalizePayGameError(result.error)}`);

      let fragmentsAfter = fragmentsAfterDebit;
      let prizeFragments: number | undefined;
      const settlesImmediately = INSTANT_RESOLVE_GAMES.has(params.gameKey) || typeof result.prizeCrc === "number";

      if (settlesImmediately) {
        const grossPrizeCrc = typeof result.prizeCrc === "number" ? result.prizeCrc : 0;
        const grossPrizeFragments = crcToFragments(grossPrizeCrc);

        if (grossPrizeFragments > 0) {
          const commission = INSTANT_RESOLVE_GAMES.has(params.gameKey)
            ? Math.floor((grossPrizeFragments * HOUSE_COMMISSION_PCT) / 100)
            : Math.max(0, amountFragments - grossPrizeFragments);
          const netPrizeFragments = grossPrizeFragments - commission;
          prizeFragments = netPrizeFragments;

          const credit = await tx.execute<{ fragments_balance: number }>(
            sql`UPDATE players
                SET fragments_balance = fragments_balance + ${netPrizeFragments},
                    last_seen = NOW()
                WHERE address = ${addr}
                RETURNING fragments_balance`,
          );
          const creditRow = (credit as any).rows?.[0] ?? (credit as any)[0];
          const creditedBalance = Number(creditRow?.fragments_balance);
          if (Number.isFinite(creditedBalance)) fragmentsAfter = creditedBalance;

          await tx.insert(gameFragmentEvents).values({
            gameKey: params.gameKey,
            gameSlug: params.slug,
            playerAddress: addr,
            playerToken: params.playerToken,
            eventType: "win",
            amountFragments: netPrizeFragments,
          });

          if (commission > 0) {
            await tx.insert(daoFragmentsPool).values({
              source: "house_edge_chance",
              gameKey: params.gameKey,
              amountFragments: commission,
            });
          }
        } else {
          await tx.insert(gameFragmentEvents).values({
            gameKey: params.gameKey,
            gameSlug: params.slug,
            playerAddress: addr,
            playerToken: params.playerToken,
            eventType: "loss",
            amountFragments,
          });
          await tx.insert(daoFragmentsPool).values({
            source: "house_edge_chance",
            gameKey: params.gameKey,
            amountFragments,
          });
        }
      }

      return {
        ok: true as const,
        fragmentsAfter,
        family: "chance" as const,
        roundId: result.id,
        tableId: result.tableId,
        gameRow: result.gameRow,
        prizeFragments,
      };
    });

    if (result.ok) {
      await awardFragmentsChanceXp(params, result, addr, amountCrc, amountFragments);
    }

    return result;
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "";
    const match = message.match(/^(multi|chance):(.+)$/);
    if (match) return { ok: false, error: normalizePayGameError(match[2]) };
    console.error("[wallet-fragments] payGameFromFragments error:", err);
    return { ok: false, error: "internal_error" };
  }
}

export async function creditMultiWinnerFragments(params: {
  gameKey: string;
  slug: string;
  winnerAddress: string;
  pot: number;
  playerToken?: string | null;
}): Promise<{ ok: true; netFragments: number; commissionFragments: number } | { ok: false; error: string }> {
  const addr = params.winnerAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) return { ok: false, error: "invalid_address" };
  if (!params.pot || params.pot <= 0) return { ok: false, error: "invalid_amount" };

  const commission = Math.floor((params.pot * HOUSE_COMMISSION_PCT) / 100);
  const netFragments = params.pot - commission;

  try {
    return await db.transaction(async (tx) => {
      const existing = await tx
        .select({ id: gameFragmentEvents.id })
        .from(gameFragmentEvents)
        .where(sql`${gameFragmentEvents.gameKey} = ${params.gameKey}
                  AND ${gameFragmentEvents.gameSlug} = ${params.slug}
                  AND ${gameFragmentEvents.playerAddress} = ${addr}
                  AND ${gameFragmentEvents.eventType} = 'win'`)
        .limit(1);
      if (existing.length > 0) {
        return { ok: true as const, netFragments, commissionFragments: commission };
      }

      await tx.execute(
        sql`INSERT INTO players (address, xp, fragments_balance, fragments_spent, level, streak, last_seen, created_at)
            VALUES (${addr}, 0, ${netFragments}, 0, 1, 0, NOW(), NOW())
            ON CONFLICT (address) DO UPDATE
            SET fragments_balance = players.fragments_balance + ${netFragments},
                last_seen = NOW()`,
      );

      await tx.insert(gameFragmentEvents).values({
        gameKey: params.gameKey,
        gameSlug: params.slug,
        playerAddress: addr,
        playerToken: params.playerToken ?? null,
        eventType: "win",
        amountFragments: netFragments,
      });

      if (commission > 0) {
        await tx.insert(daoFragmentsPool).values({
          source: "commission_multiplayer",
          gameKey: params.gameKey,
          amountFragments: commission,
        });
      }

      return { ok: true as const, netFragments, commissionFragments: commission };
    });
  } catch (err) {
    console.error("[wallet-fragments] creditMultiWinnerFragments error:", err);
    return { ok: false, error: "internal_error" };
  }
}
