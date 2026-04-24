/**
 * Wallet — prepaid CRC balance helpers.
 *
 * Phase 3a scope: getBalance + creditWallet + scanWalletTopups.
 * Phase 3b will add debitForGame. Phase 3d will add cashout.
 *
 * Invariant (monitored in 3e):
 *   players.balance_crc(addr) == SUM(wallet_ledger.amount_crc WHERE address=addr)
 * Achieved by always updating balance and inserting a ledger row in the
 * same transaction, with wallet_ledger.tx_hash UNIQUE for on-chain idempotency.
 */

import { db } from "./db";
import { players, walletLedger } from "./db/schema";
import { eq, sql } from "drizzle-orm";
import { checkAllWalletTopups } from "./circles";
import { executePayout } from "./payout";
import {
  CHANCE_BALANCE_SUPPORTED,
  MULTI_BALANCE_SUPPORTED,
  assignMultiPlayer,
  assignCrcRacesPlayer,
  createChanceRound,
  type CreateChanceRoundOpts,
} from "./wallet-game-dispatch";
import {
  applyLedgerEntry,
  DAO_TREASURY_ADDRESS,
} from "./wallet-ledger";
import {
  announceNewLobbyGame,
  markLobbyGameStarted,
} from "./telegram/lobby-announce";

/**
 * Does the given source tx hash identify a balance-paid round?
 * Balance-paid rounds carry a synthetic tx hash of the form `balance:{ledgerId}`.
 * Real on-chain tx hashes are 0x-prefixed 32-byte hex strings.
 */
export function isBalancePaid(sourceTxHash: string | null | undefined): boolean {
  return typeof sourceTxHash === "string" && sourceTxHash.startsWith("balance:");
}

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";
const WEI_PER_CRC = 1_000_000_000_000_000_000n;

function normalize(address: string): string {
  return address.trim().toLowerCase();
}

export async function getBalance(address: string): Promise<number> {
  const addr = normalize(address);
  if (!addr) return 0;
  const [row] = await db
    .select({ balanceCrc: players.balanceCrc })
    .from(players)
    .where(eq(players.address, addr))
    .limit(1);
  return row?.balanceCrc ?? 0;
}

export type CreditKind = "topup" | "prize" | "commission" | "cashout-refund";
// LedgerKindAll is imported from wallet-ledger above and re-used here for
// the shared applyLedgerEntry primitive.

/**
 * Pseudo-address used to track the DAO's accumulated treasury (bets in,
 * prizes out). Re-exported from wallet-ledger so external callers keep using
 * `import { DAO_TREASURY_ADDRESS } from "@/lib/wallet"`. The actual constant
 * lives in wallet-ledger.ts to avoid circular imports with the dispatch layer.
 */
export { DAO_TREASURY_ADDRESS };

export type CreditOpts = {
  kind: CreditKind;
  reason?: string;
  /** On-chain tx hash — present for topups and cashout refunds. UNIQUE → idempotent. */
  txHash?: string;
  gameType?: string;
  gameSlug?: string;
};

export type CreditResult =
  | { ok: true; balanceAfter: number; ledgerId: number }
  | { ok: false; skipped: "duplicate_txhash" };

/**
 * Credit an address and write the corresponding ledger row atomically.
 * If txHash is supplied and already exists in wallet_ledger, the credit
 * is skipped (returns { ok: false, skipped: "duplicate_txhash" }).
 *
 * Upserts the players row on first credit for an address (so winners
 * who never topped up still get their row created).
 */
export async function creditWallet(
  address: string,
  amountCrc: number,
  opts: CreditOpts,
): Promise<CreditResult> {
  if (amountCrc <= 0) throw new Error(`creditWallet: amountCrc must be > 0 (got ${amountCrc})`);
  const addr = normalize(address);
  if (!addr) throw new Error("creditWallet: address required");

  return db.transaction(async (tx) => {
    const res = await applyLedgerEntry(tx, addr, amountCrc, opts.kind, {
      reason: opts.reason,
      txHash: opts.txHash,
      gameType: opts.gameType,
      gameSlug: opts.gameSlug,
    });
    if ("skipped" in res) return { ok: false, skipped: "duplicate_txhash" } as const;
    return { ok: true, balanceAfter: res.balanceAfter, ledgerId: res.ledgerId } as const;
  });
}

/**
 * Scan the Safe for wallet topup payments, credit each sender once.
 * Idempotent via wallet_ledger.tx_hash UNIQUE.
 *
 * Returns a summary. Call from /api/wallet/topup-scan on-demand (after
 * the user sends a topup tx and hits the "refresh" button in the UI).
 */
export async function scanWalletTopups(): Promise<{
  credited: number;
  skipped: number;
  errors: number;
}> {
  if (!SAFE_ADDRESS) throw new Error("SAFE_ADDRESS not configured");

  const events = await checkAllWalletTopups(SAFE_ADDRESS);

  let credited = 0;
  let skipped = 0;
  let errors = 0;

  for (const ev of events) {
    try {
      // Convert wei -> CRC (real/float). Round to 6 decimals for storage.
      const wei = BigInt(ev.value);
      const amountCrc = Number(wei) / Number(WEI_PER_CRC);
      if (!isFinite(amountCrc) || amountCrc <= 0) {
        skipped++;
        continue;
      }
      const rounded = Math.round(amountCrc * 1_000_000) / 1_000_000;

      const result = await creditWallet(ev.sender, rounded, {
        kind: "topup",
        reason: "Wallet topup",
        txHash: ev.transactionHash.toLowerCase(),
      });
      if (result.ok) credited++;
      else skipped++;
    } catch (err) {
      console.error(`[Wallet] scanWalletTopups error for tx ${ev.transactionHash}:`, err);
      errors++;
    }
  }

  return { credited, skipped, errors };
}

export type PayGameFromBalanceParams = {
  address: string;
  gameKey: string;
  slug: string;
  amount: number;
  playerToken: string;
  /** Game-specific extras: ballValue (plinko), mineCount (mines), pickCount (keno). */
  extras?: CreateChanceRoundOpts;
};

export type PayGameFromBalanceResult =
  | {
      ok: true;
      balanceAfter: number;
      ledgerId: number;
      family: "multi";
      role: "player1" | "player2" | "racer";
      gameRow: any;
    }
  | {
      ok: true;
      balanceAfter: number;
      ledgerId: number;
      family: "chance";
      roundId: number;
      tableId: number;
      gameRow: any;
      /** For instant-resolve games (coin_flip, lootbox). The prize has been
       *  credited to the player already; `balanceAfter` is the post-credit
       *  balance. `prizeLedgerId` is the ledger row id of the credit. 0 on
       *  a loss. Undefined for regular chance games. */
      prizeCrc?: number;
      prizeLedgerId?: number;
    }
  | { ok: false; error: string };

/**
 * Debit a player's prepaid balance and attribute them to a multi slot or a
 * new chance-game round, atomically. If the game-side write fails, the
 * debit and ledger row roll back together — no orphan CRC.
 *
 * Supported gameKeys: everything in MULTI_BALANCE_SUPPORTED and
 * CHANCE_BALANCE_SUPPORTED (see wallet-game-dispatch.ts). Games not in
 * either set (today: coin_flip) must continue to use the on-chain flow.
 */
export async function payGameFromBalance(
  params: PayGameFromBalanceParams,
): Promise<PayGameFromBalanceResult> {
  const addr = params.address.trim().toLowerCase();
  if (!addr || !/^0x[a-f0-9]{40}$/.test(addr)) {
    return { ok: false, error: "invalid_address" };
  }
  if (!params.amount || params.amount <= 0) {
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

  try {
    const txResult = await db.transaction(async (tx) => {
      // Step 1: atomic debit. UPDATE...WHERE balance_crc >= amount RETURNING
      // is serialized per-row in PG, so two concurrent debits on the same
      // address cannot over-spend.
      const debitRes = await tx.execute<{ balance_crc: number }>(
        sql`UPDATE players
            SET balance_crc = balance_crc - ${params.amount},
                last_seen = NOW()
            WHERE address = ${addr} AND balance_crc >= ${params.amount}
            RETURNING balance_crc`,
      );
      const row = (debitRes as any).rows?.[0] ?? (debitRes as any)[0];
      if (!row || typeof row.balance_crc !== "number") {
        // Either the players row doesn't exist (never topped up) or the
        // balance is below the bet amount. Either way → insufficient.
        return { ok: false as const, error: "insufficient_balance" };
      }
      const balanceAfter = row.balance_crc;

      // Step 2: ledger. reason encodes "bet:{gameKey}:{slug}" for audit.
      const [ledger] = await tx
        .insert(walletLedger)
        .values({
          address: addr,
          kind: "debit",
          amountCrc: -params.amount,
          balanceAfter,
          reason: `Bet ${params.gameKey} ${params.slug}`,
          txHash: null,
          gameType: params.gameKey,
          gameSlug: params.slug,
        })
        .returning({ id: walletLedger.id });

      const syntheticTxHash = `balance:${ledger.id}`;

      // Step 2b: mirror on DAO treasury. The bet leaves the user, so it has
      // to go somewhere in the DB — the treasury pseudo-address acts as the
      // "house", matching how an on-chain bet flows into the Safe. This
      // keeps the invariant sum(players.balance_crc) == Safe_onchain
      // (modulo topups/cashouts) holdable across balance-pay activity.
      // txHash is unique via the user ledger id → idempotent on retry.
      await applyLedgerEntry(
        tx,
        DAO_TREASURY_ADDRESS,
        params.amount,
        "house-bet",
        {
          reason: `House bet ${params.gameKey} ${params.slug}`,
          txHash: `house-bet:${ledger.id}`,
          gameType: params.gameKey,
          gameSlug: params.slug,
        },
      );

      // Step 3: game-side write.
      if (isMulti) {
        // crc-races uses an N-player JSONB array instead of player1/player2
        // slots, so it needs its own assignment helper.
        const result = params.gameKey === "crc-races"
          ? await assignCrcRacesPlayer(
              tx,
              params.slug,
              addr,
              params.playerToken,
              params.amount,
              syntheticTxHash,
            )
          : await assignMultiPlayer(
              tx,
              params.gameKey,
              params.slug,
              addr,
              params.playerToken,
              params.amount,
              syntheticTxHash,
            );
        if ("error" in result) {
          // Abort the transaction so debit + ledger are rolled back.
          throw new Error(`multi:${result.error}`);
        }
        return {
          ok: true as const,
          balanceAfter,
          ledgerId: ledger.id,
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
        params.amount,
        syntheticTxHash,
        params.extras || {},
      );
      if ("error" in result) {
        throw new Error(`chance:${result.error}`);
      }

      // Instant-resolve games (coin_flip, lootbox) settle at bet time.
      // The dispatcher has already flipped / rolled server-side and reports
      // `prizeCrc`. Credit the player + debit the treasury atomically so the
      // full bet → resolve → credit path is one transaction. On a loss
      // (prizeCrc === 0) we skip — the bet stays on the treasury side,
      // matching the on-chain flow where the Safe keeps the loss.
      let finalBalance = balanceAfter;
      let prizeLedgerId: number | undefined;
      if (typeof result.prizeCrc === "number" && result.prizeCrc > 0) {
        const prizeRef = `${params.gameKey}-${result.id}`;
        const userCredit = await applyLedgerEntry(
          tx,
          addr,
          result.prizeCrc,
          "prize",
          {
            reason: `Prize ${params.gameKey} ${params.slug}`,
            txHash: `prize:${params.gameKey}:${prizeRef}`,
            gameType: params.gameKey,
            gameSlug: params.slug,
          },
        );
        if ("balanceAfter" in userCredit) {
          finalBalance = userCredit.balanceAfter;
          prizeLedgerId = userCredit.ledgerId;
        }
        // If the user credit was skipped as duplicate (idempotent retry),
        // the treasury debit must also be idempotent via its own unique
        // txHash — applyLedgerEntry handles that check internally.
        await applyLedgerEntry(
          tx,
          DAO_TREASURY_ADDRESS,
          -result.prizeCrc,
          "house-payout",
          {
            reason: `House payout ${params.gameKey} ${params.slug}`,
            txHash: `house-payout:${params.gameKey}:${prizeRef}`,
            gameType: params.gameKey,
            gameSlug: params.slug,
          },
        );
      }

      return {
        ok: true as const,
        balanceAfter: finalBalance,
        ledgerId: ledger.id,
        family: "chance" as const,
        roundId: result.id,
        tableId: result.tableId,
        gameRow: result.gameRow,
        prizeCrc: result.prizeCrc,
        prizeLedgerId,
      };
    });

    // Post-commit: annonce Telegram du lobby pour les parties multi.
    // Fait hors-transaction pour ne pas bloquer la DB sur une requete HTTP,
    // et pour ne pas annoncer une partie qui aurait ete rollback. Mirror du
    // comportement de scanGamePayments pour le flow on-chain. No-op si
    // TELEGRAM_LOBBY_CHAT_ID n'est pas configure (jamais throw).
    // crc-races: on-chain scan skipt les annonces Telegram du lobby (role
    // "racer" n'a pas de mapping clair 1→announce / 2→start). Mirror ce
    // comportement en skippant aussi le flow balance-pay.
    if (txResult.ok && txResult.family === "multi" && params.gameKey !== "crc-races") {
      const gameRow = txResult.gameRow;
      if (txResult.role === "player1") {
        await announceNewLobbyGame({
          gameKey: params.gameKey,
          slug: params.slug,
          betCrc: gameRow.betCrc,
          creatorAddress: addr,
          isPrivate: gameRow.isPrivate,
        });
      } else if (txResult.role === "player2") {
        await markLobbyGameStarted({
          gameKey: params.gameKey,
          slug: params.slug,
          betCrc: gameRow.betCrc,
          creatorAddress: gameRow.player1Address,
        });
      }
    }

    return txResult;
  } catch (err: any) {
    const msg = String(err?.message || err);
    // Normalize "multi:wrong_bet" → "wrong_bet" etc.
    const colon = msg.indexOf(":");
    const normalized = colon > 0 && colon < 30 ? msg.slice(colon + 1) : msg;
    return { ok: false, error: normalized || "transaction_failed" };
  }
}

export type DebitSecondaryBetResult =
  | { ok: true; balanceAfter: number; ledgerId: number }
  | { ok: false; error: "insufficient_balance" | "invalid_address" | "invalid_amount" };

/**
 * Debit a player's balance for an in-round extra bet (e.g. blackjack double
 * or split). The game round already exists; this is just a balance move.
 *
 * Atomic: the user debit + user ledger row + treasury mirror all commit
 * together, or not at all. On success returns a ledgerId that callers should
 * fold into their round's claim / secondary-bet tracking.
 */
export async function debitForSecondaryBet(params: {
  address: string;
  amount: number;
  gameType: string;
  gameSlug: string;
  /** Free-text audit label — ends up in wallet_ledger.reason. */
  reason: string;
}): Promise<DebitSecondaryBetResult> {
  const addr = normalize(params.address);
  if (!addr || !/^0x[a-f0-9]{40}$/.test(addr)) {
    return { ok: false, error: "invalid_address" };
  }
  if (!params.amount || params.amount <= 0) {
    return { ok: false, error: "invalid_amount" };
  }

  return db.transaction(async (tx) => {
    const debitRes = await tx.execute(
      sql`UPDATE players
          SET balance_crc = balance_crc - ${params.amount},
              last_seen = NOW()
          WHERE address = ${addr} AND balance_crc >= ${params.amount}
          RETURNING balance_crc`,
    );
    const row = (debitRes as any).rows?.[0] ?? (debitRes as any)[0];
    if (!row || typeof row.balance_crc !== "number") {
      return { ok: false as const, error: "insufficient_balance" };
    }
    const balanceAfter = row.balance_crc;

    const [ledger] = await tx
      .insert(walletLedger)
      .values({
        address: addr,
        kind: "debit",
        amountCrc: -params.amount,
        balanceAfter,
        reason: params.reason,
        txHash: null,
        gameType: params.gameType,
        gameSlug: params.gameSlug,
      })
      .returning({ id: walletLedger.id });

    // Mirror to treasury (house-bet). Idempotent via unique txHash keyed on
    // the user ledger id, so a retry collapses cleanly.
    await applyLedgerEntry(
      tx,
      DAO_TREASURY_ADDRESS,
      params.amount,
      "house-bet",
      {
        reason: `House bet ${params.gameType} ${params.gameSlug}`,
        txHash: `house-bet:${ledger.id}`,
        gameType: params.gameType,
        gameSlug: params.gameSlug,
      },
    );

    return { ok: true as const, balanceAfter, ledgerId: ledger.id };
  });
}

export type CashoutResult =
  | {
      ok: true;
      balanceAfter: number;
      debitLedgerId: number;
      payoutTxHash: string | null;
    }
  | {
      ok: false;
      error:
        | "invalid_address"
        | "invalid_amount"
        | "insufficient_balance"
        | "payout_failed";
      /** For payout_failed: the ledger id of the rollback refund. */
      refundLedgerId?: number;
      /** Raw error from the on-chain payout pipeline. */
      payoutError?: string;
    };

/**
 * Move CRC from a player's prepaid balance to their wallet on-chain.
 *
 * Flow:
 * 1. Atomic debit of the player's balance_crc. Fails with insufficient_balance
 *    if they don't have enough — no on-chain call is made.
 * 2. executePayout() dispatches the ERC-1155 transfer from the Safe. The
 *    gameId is keyed on `cashoutTokenId` so a retry lands as `already_paid`.
 * 3. If step 2 reports `success`: done. Return the debit ledger id + tx hash.
 *    If step 2 fails: credit the balance back atomically (kind="cashout-refund",
 *    unique tx_hash keyed on cashoutTokenId) so the user never loses the CRC.
 *
 * No treasury mirror: cashout moves CRC out of the "system" entirely (user
 * balance AND Safe on-chain both decrement). The invariant
 *   sum(balances) + treasury == Safe_onchain
 * still holds (both sides drop by the same `amountCrc`).
 *
 * Caller (the cashout API route) is responsible for verifying the 1 CRC
 * proof of ownership before calling this. This helper trusts the `address`
 * parameter.
 */
export async function cashout(params: {
  address: string;
  amountCrc: number;
  /** Cashout token row id — used to build idempotent tx hashes. */
  cashoutTokenId: number;
}): Promise<CashoutResult> {
  const addr = normalize(params.address);
  if (!addr || !/^0x[a-f0-9]{40}$/.test(addr)) {
    return { ok: false, error: "invalid_address" };
  }
  if (!params.amountCrc || params.amountCrc <= 0) {
    return { ok: false, error: "invalid_amount" };
  }

  // Step 1 — atomic debit + ledger insert.
  const debitResult = await db.transaction(async (tx) => {
    const res = await tx.execute(
      sql`UPDATE players
          SET balance_crc = balance_crc - ${params.amountCrc},
              last_seen = NOW()
          WHERE address = ${addr} AND balance_crc >= ${params.amountCrc}
          RETURNING balance_crc`,
    );
    const row = (res as any).rows?.[0] ?? (res as any)[0];
    if (!row || typeof row.balance_crc !== "number") {
      return { ok: false as const, error: "insufficient_balance" as const };
    }
    const balanceAfter = row.balance_crc;

    const [ledger] = await tx
      .insert(walletLedger)
      .values({
        address: addr,
        kind: "cashout",
        amountCrc: -params.amountCrc,
        balanceAfter,
        reason: `Cashout #${params.cashoutTokenId}`,
        txHash: `cashout:${params.cashoutTokenId}`,
        gameType: "cashout",
        gameSlug: String(params.cashoutTokenId),
      })
      .returning({ id: walletLedger.id });

    return { ok: true as const, balanceAfter, ledgerId: ledger.id };
  });

  if (!debitResult.ok) {
    return { ok: false, error: debitResult.error };
  }

  // Step 2 — on-chain payout. gameId is unique per cashout session, so a
  // retry of the same session reads back `already_paid` and no CRC leaves
  // the Safe twice.
  const payoutResult = await executePayout({
    gameType: "cashout",
    gameId: `cashout-${params.cashoutTokenId}`,
    recipientAddress: addr,
    amountCrc: params.amountCrc,
    reason: `Cashout #${params.cashoutTokenId} — ${params.amountCrc} CRC`,
  });

  if (payoutResult.success) {
    return {
      ok: true,
      balanceAfter: debitResult.balanceAfter,
      debitLedgerId: debitResult.ledgerId,
      payoutTxHash: payoutResult.transferTxHash || null,
    };
  }

  // Step 3 — rollback: the payout failed, so credit the balance back.
  // Unique txHash prevents a double-refund if this path is retried.
  const refundResult = await creditWallet(addr, params.amountCrc, {
    kind: "cashout-refund",
    reason: `Cashout #${params.cashoutTokenId} refund — payout failed`,
    txHash: `cashout-refund:${params.cashoutTokenId}`,
  });

  return {
    ok: false,
    error: "payout_failed",
    refundLedgerId: refundResult.ok ? refundResult.ledgerId : undefined,
    payoutError: payoutResult.error,
  };
}

/**
 * Credit a player who won a game. Thin wrapper over creditWallet that
 * encodes a deterministic, unique `txHash` (format `prize:{gameType}:{gameRef}`)
 * so a retry or double-call lands as `skipped: duplicate_txhash` instead of
 * double-paying the winner.
 *
 * `gameRef` must uniquely identify the round within its gameType. Examples:
 * - chance round: `${tableId}-${roundId}` (id is serial, so unique globally
 *   within the game's table)
 * - multi game: `${slug}` (game slug is unique)
 */
export async function creditPrize(
  winnerAddress: string,
  amountCrc: number,
  ref: { gameType: string; gameSlug: string; gameRef: string },
): Promise<CreditResult> {
  if (amountCrc <= 0) {
    // Nothing to credit — treat as no-op success.
    return { ok: true, balanceAfter: 0, ledgerId: 0 } as any;
  }
  const addr = normalize(winnerAddress);
  if (!addr) throw new Error("creditPrize: winnerAddress required");

  const userTxHash = `prize:${ref.gameType}:${ref.gameRef}`;
  const treasuryTxHash = `house-payout:${ref.gameType}:${ref.gameRef}`;

  return db.transaction(async (tx) => {
    // Credit the winner.
    const userRes = await applyLedgerEntry(tx, addr, amountCrc, "prize", {
      reason: `Prize ${ref.gameType} ${ref.gameSlug}`,
      txHash: userTxHash,
      gameType: ref.gameType,
      gameSlug: ref.gameSlug,
    });
    if ("skipped" in userRes) return { ok: false, skipped: "duplicate_txhash" } as const;

    // Mirror on DAO treasury: the house pays out. Deterministic txHash keyed
    // on gameRef means a retry lands as duplicate_txhash and the treasury
    // is not double-debited. We still succeed from the winner's POV (they
    // got credited once on the user side).
    await applyLedgerEntry(
      tx,
      DAO_TREASURY_ADDRESS,
      -amountCrc,
      "house-payout",
      {
        reason: `House payout ${ref.gameType} ${ref.gameSlug}`,
        txHash: treasuryTxHash,
        gameType: ref.gameType,
        gameSlug: ref.gameSlug,
      },
    );

    return { ok: true, balanceAfter: userRes.balanceAfter, ledgerId: userRes.ledgerId } as const;
  });
}

/**
 * Credit the DAO treasury for a commission fee on a game. Same idempotency
 * pattern as creditPrize — unique `txHash` of the form
 * `commission:{gameType}:{gameRef}` guarantees no double-counting.
 *
 * The DAO_TREASURY_ADDRESS is a pseudo-address (see constant above). Nothing
 * signs on-chain for it; it's purely a DB row that aggregates commission so
 * the invariant `sum(players.balance_crc) == Safe_onchain_balance` holds.
 */
export async function creditCommission(
  amountCrc: number,
  ref: { gameType: string; gameSlug: string; gameRef: string },
): Promise<CreditResult> {
  if (amountCrc <= 0) {
    return { ok: true, balanceAfter: 0, ledgerId: 0 } as any;
  }
  return creditWallet(DAO_TREASURY_ADDRESS, amountCrc, {
    kind: "commission",
    reason: `Commission ${ref.gameType} ${ref.gameSlug}`,
    txHash: `commission:${ref.gameType}:${ref.gameRef}`,
    gameType: ref.gameType,
    gameSlug: ref.gameSlug,
  });
}

export type PayPrizeResult = {
  method: "balance" | "onchain";
  ok: boolean;
  /** wallet_ledger.id when method === "balance" */
  ledgerId?: number;
  /** on-chain tx hash when method === "onchain" */
  transferTxHash?: string;
  error?: string;
};

/**
 * Asymmetric prize payout — the source payment method determines where the
 * prize lands:
 *
 * - If the round was balance-paid (sourceTxHash starts with "balance:"),
 *   the win is credited to the winner's NF Society balance via creditPrize.
 *   DAO commission, if any, is credited via creditCommission.
 *
 * - Otherwise (real on-chain tx hash), the win is paid on-chain via the
 *   Safe + Roles Modifier, same as before Phase 3c. Commission stays
 *   implicit in the Safe.
 *
 * This mirrors user expectations: you pay on-chain, you get paid on-chain;
 * you pay from balance, you get paid on balance.
 */
export async function payPrize(
  recipientAddress: string,
  amountCrc: number,
  opts: {
    gameType: string;
    gameSlug: string;
    gameRef: string;
    sourceTxHash: string | null | undefined;
    /** Optional human-readable reason used only by the on-chain path. */
    reason?: string;
  },
): Promise<PayPrizeResult> {
  if (amountCrc <= 0) {
    return { method: isBalancePaid(opts.sourceTxHash) ? "balance" : "onchain", ok: true };
  }

  if (isBalancePaid(opts.sourceTxHash)) {
    const result = await creditPrize(recipientAddress, amountCrc, {
      gameType: opts.gameType,
      gameSlug: opts.gameSlug,
      gameRef: opts.gameRef,
    });
    return {
      method: "balance",
      ok: true,
      ledgerId: result.ok ? result.ledgerId : undefined,
    };
  }

  const result = await executePayout({
    gameType: opts.gameType,
    gameId: `${opts.gameType}-${opts.gameRef}`,
    recipientAddress,
    amountCrc,
    reason: opts.reason || `${opts.gameType} ${opts.gameSlug} prize`,
  });
  return {
    method: "onchain",
    ok: result.success,
    transferTxHash: result.transferTxHash,
    error: result.error,
  };
}

/**
 * Commission payout — asymmetric too. If the game was balance-paid, the
 * commission is credited to the DAO treasury (creditCommission). If the game
 * was on-chain, the commission stays implicit in the Safe — no on-chain tx,
 * no DAO ledger entry. This matches the pre-Phase-3c behavior for on-chain
 * games (Safe keeps the fee).
 */
export async function payCommission(
  amountCrc: number,
  opts: {
    gameType: string;
    gameSlug: string;
    gameRef: string;
    sourceTxHash: string | null | undefined;
  },
): Promise<{ method: "balance" | "onchain-implicit"; ok: boolean; ledgerId?: number }> {
  if (amountCrc <= 0) {
    return { method: isBalancePaid(opts.sourceTxHash) ? "balance" : "onchain-implicit", ok: true };
  }
  if (!isBalancePaid(opts.sourceTxHash)) {
    // On-chain game: commission stays in Safe, nothing to record.
    return { method: "onchain-implicit", ok: true };
  }
  const result = await creditCommission(amountCrc, opts);
  return {
    method: "balance",
    ok: true,
    ledgerId: result.ok ? result.ledgerId : undefined,
  };
}

/**
 * Return the last N ledger entries for an address, newest first.
 */
export async function getLedger(address: string, limit = 20) {
  const addr = normalize(address);
  if (!addr) return [];
  const rows = await db
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.address, addr))
    .orderBy(sql`${walletLedger.createdAt} DESC`)
    .limit(Math.min(Math.max(limit, 1), 100));

  // Enrich cashout rows with the real on-chain payout tx hash. The ledger
  // row's own tx_hash is the synthetic `cashout:{tokenId}` used for idempotency;
  // the user actually wants to see the 0x... hash to verify on gnosisscan.
  const cashoutTokenIds: number[] = [];
  for (const r of rows) {
    if (r.kind === "cashout" && typeof r.txHash === "string" && r.txHash.startsWith("cashout:")) {
      const id = Number(r.txHash.slice("cashout:".length));
      if (!isNaN(id)) cashoutTokenIds.push(id);
    }
  }

  if (cashoutTokenIds.length === 0) {
    return rows.map((r) => ({ ...r, onchainTxHash: null as string | null }));
  }

  const { cashoutTokens } = await import("./db/schema/cashout");
  const { inArray } = await import("drizzle-orm");
  const sessions = await db
    .select({ id: cashoutTokens.id, payoutTxHash: cashoutTokens.payoutTxHash })
    .from(cashoutTokens)
    .where(inArray(cashoutTokens.id, cashoutTokenIds));
  const bySessionId = new Map(sessions.map((s) => [s.id, s.payoutTxHash] as const));

  return rows.map((r) => {
    if (r.kind === "cashout" && typeof r.txHash === "string" && r.txHash.startsWith("cashout:")) {
      const id = Number(r.txHash.slice("cashout:".length));
      return { ...r, onchainTxHash: bySessionId.get(id) || null };
    }
    // For rows whose own txHash is already a 0x on-chain hash (topups), surface it too.
    const raw = typeof r.txHash === "string" && r.txHash.startsWith("0x") ? r.txHash : null;
    return { ...r, onchainTxHash: raw };
  });
}
