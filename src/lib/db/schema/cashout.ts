import { pgTable, serial, text, real, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Cashout sessions. A cashout is a two-step process:
 *
 * 1. Client calls POST /api/wallet/cashout-init with { amountCrc }. The server
 *    creates a row here with status="pending", generates a one-shot token, and
 *    returns the 1 CRC payment link (pattern shared with nf_auth recovery).
 *
 * 2. Client pays 1 CRC with data `nf_cashout:{token}` to the Safe. The client
 *    polls GET /api/wallet/cashout-status?token=X; the server scans, matches
 *    the payment, stores the sender address, debits the user's balance for
 *    amountCrc, dispatches the on-chain payout, and refunds the 1 CRC proof.
 *
 * If the on-chain payout fails after the balance debit, the server credits
 * the balance back (kind="cashout-refund") so the user never loses the CRC.
 *
 * The row doubles as an audit log — every cashout is traceable end-to-end.
 */
export const cashoutTokens = pgTable(
  "cashout_tokens",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    /** Requested cashout amount in CRC. Integer or fractional. */
    amountCrc: real("amount_crc").notNull(),
    /** Payer address — filled once the 1 CRC proof payment is detected. */
    address: text("address"),
    /**
     * Lifecycle:
     *   pending   — token issued, waiting for 1 CRC proof
     *   paid      — proof detected, processing (short-lived)
     *   completed — payout succeeded
     *   failed    — payout failed (balance refunded via cashout-refund)
     *   expired   — token aged out without proof
     */
    status: text("status").notNull().default("pending"),
    /** 1 CRC proof tx hash (the user's payment into the Safe). */
    proofTxHash: text("proof_tx_hash"),
    /** On-chain payout tx hash when the Safe sent `amountCrc` to `address`. */
    payoutTxHash: text("payout_tx_hash"),
    /** 1 CRC refund tx hash (Safe -> user). */
    refundTxHash: text("refund_tx_hash"),
    /** Free-text error when status="failed". */
    errorMessage: text("error_message"),
    /** Ledger row id of the user's debit — for audit. */
    debitLedgerId: text("debit_ledger_id"),
    /** Ledger row id of the rollback credit when status="failed". */
    refundLedgerId: text("refund_ledger_id"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    tokenIdx: index("cashout_tokens_token_idx").on(table.token),
    addressIdx: index("cashout_tokens_address_idx").on(table.address),
    statusIdx: index("cashout_tokens_status_idx").on(table.status),
  }),
);

export type CashoutTokenRow = typeof cashoutTokens.$inferSelect;
export type NewCashoutToken = typeof cashoutTokens.$inferInsert;
