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
  createChanceRound,
  type CreateChanceRoundOpts,
} from "./wallet-game-dispatch";

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

/**
 * Pseudo-address used to track the DAO's accumulated commission. This is NOT
 * a real wallet — nothing ever signs on-chain for it. It's just a row in the
 * players table that aggregates all commission fees withheld from game wins,
 * so the invariant `sum(players.balance_crc) == Safe_onchain_balance` holds.
 *
 * Overridable via env for prod tuning, defaults to a recognizable sentinel.
 */
export const DAO_TREASURY_ADDRESS =
  (process.env.DAO_TREASURY_ADDRESS || "0x000000000000000000000000000000000000da00").toLowerCase();

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
    // 1) If txHash provided, short-circuit on duplicate (idempotency).
    if (opts.txHash) {
      const [existing] = await tx
        .select({ id: walletLedger.id })
        .from(walletLedger)
        .where(eq(walletLedger.txHash, opts.txHash))
        .limit(1);
      if (existing) return { ok: false, skipped: "duplicate_txhash" } as const;
    }

    // 2) Upsert players row and bump balance_crc.
    //    INSERT ... ON CONFLICT DO UPDATE returns the new balance.
    const result = await tx.execute<{ balance_crc: number }>(
      sql`INSERT INTO players (address, balance_crc)
          VALUES (${addr}, ${amountCrc})
          ON CONFLICT (address) DO UPDATE
            SET balance_crc = players.balance_crc + ${amountCrc},
                last_seen   = NOW()
          RETURNING balance_crc`,
    );
    const balanceAfter =
      (result as any).rows?.[0]?.balance_crc ??
      (result as any)[0]?.balance_crc;
    if (typeof balanceAfter !== "number") {
      throw new Error("creditWallet: failed to read balance_after");
    }

    // 3) Insert ledger row.
    const [ledger] = await tx
      .insert(walletLedger)
      .values({
        address: addr,
        kind: opts.kind,
        amountCrc: amountCrc,
        balanceAfter,
        reason: opts.reason || null,
        txHash: opts.txHash || null,
        gameType: opts.gameType || null,
        gameSlug: opts.gameSlug || null,
      })
      .returning({ id: walletLedger.id });

    return { ok: true, balanceAfter, ledgerId: ledger.id } as const;
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
      role: "player1" | "player2";
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
    return await db.transaction(async (tx) => {
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

      // Step 3: game-side write.
      if (isMulti) {
        const result = await assignMultiPlayer(
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
      return {
        ok: true as const,
        balanceAfter,
        ledgerId: ledger.id,
        family: "chance" as const,
        roundId: result.id,
        tableId: result.tableId,
        gameRow: result.gameRow,
      };
    });
  } catch (err: any) {
    const msg = String(err?.message || err);
    // Normalize "multi:wrong_bet" → "wrong_bet" etc.
    const colon = msg.indexOf(":");
    const normalized = colon > 0 && colon < 30 ? msg.slice(colon + 1) : msg;
    return { ok: false, error: normalized || "transaction_failed" };
  }
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
  return creditWallet(winnerAddress, amountCrc, {
    kind: "prize",
    reason: `Prize ${ref.gameType} ${ref.gameSlug}`,
    txHash: `prize:${ref.gameType}:${ref.gameRef}`,
    gameType: ref.gameType,
    gameSlug: ref.gameSlug,
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
  return db
    .select()
    .from(walletLedger)
    .where(eq(walletLedger.address, addr))
    .orderBy(sql`${walletLedger.createdAt} DESC`)
    .limit(Math.min(Math.max(limit, 1), 100));
}
