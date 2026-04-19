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

export type CreditKind = "topup" | "prize" | "cashout-refund";

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
