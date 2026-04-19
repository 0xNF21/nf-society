/**
 * Wallet ledger primitive shared by wallet.ts and wallet-game-dispatch.ts.
 * Kept in its own module so the dispatch layer can write ledger rows without
 * creating a circular import with wallet.ts (which imports dispatch).
 */

import { sql, eq } from "drizzle-orm";
import { walletLedger } from "./db/schema";

/** DAO treasury pseudo-address. Mirrors wallet.ts export; duplicated here
 *  to avoid the circular import. Kept in sync via env var fallback. */
export const DAO_TREASURY_ADDRESS =
  (process.env.DAO_TREASURY_ADDRESS || "0x000000000000000000000000000000000000da00").toLowerCase();

/**
 * Valid values for wallet_ledger.kind. DB column is free text; this type is
 * only enforced at the TS level.
 */
export type LedgerKindAll =
  | "topup"
  | "prize"
  | "commission"
  | "cashout-refund"
  | "debit"
  | "house-bet"
  | "house-payout"
  | "cashout";

/**
 * Apply a signed amount to an address's balance and write the matching
 * wallet_ledger row. Must be called inside a db.transaction callback so
 * the balance bump and ledger insert commit together.
 *
 * - Positive amount = credit, negative = debit. No balance floor here;
 *   callers with a minimum (e.g. "insufficient_balance") must pre-check.
 * - If txHash is supplied and already exists, returns { skipped } and does
 *   not touch the balance. Callers decide whether that's ok or an error.
 */
export async function applyLedgerEntry(
  tx: any,
  address: string,
  signedAmount: number,
  kind: LedgerKindAll,
  opts: {
    reason?: string;
    txHash?: string;
    gameType?: string;
    gameSlug?: string;
  } = {},
): Promise<
  | { balanceAfter: number; ledgerId: number }
  | { skipped: "duplicate_txhash" }
> {
  if (opts.txHash) {
    const [existing] = await tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .where(eq(walletLedger.txHash, opts.txHash))
      .limit(1);
    if (existing) return { skipped: "duplicate_txhash" };
  }

  const result = await tx.execute(
    sql`INSERT INTO players (address, balance_crc)
        VALUES (${address}, ${signedAmount})
        ON CONFLICT (address) DO UPDATE
          SET balance_crc = players.balance_crc + ${signedAmount},
              last_seen   = NOW()
        RETURNING balance_crc`,
  );
  const balanceAfter =
    (result as any).rows?.[0]?.balance_crc ??
    (result as any)[0]?.balance_crc;
  if (typeof balanceAfter !== "number") {
    throw new Error("applyLedgerEntry: failed to read balance_after");
  }

  const [ledger] = await tx
    .insert(walletLedger)
    .values({
      address,
      kind,
      amountCrc: signedAmount,
      balanceAfter,
      reason: opts.reason || null,
      txHash: opts.txHash || null,
      gameType: opts.gameType || null,
      gameSlug: opts.gameSlug || null,
    })
    .returning({ id: walletLedger.id });

  return { balanceAfter, ledgerId: ledger.id };
}
