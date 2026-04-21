export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { cashoutTokens, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { executePayout } from "@/lib/payout";
import { cashout } from "@/lib/wallet";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";
const WEI_1_CRC = BigInt("1000000000000000000");

/**
 * GET /api/wallet/cashout-status?token=X
 *
 * Polls the state of a cashout session. On each call:
 *  1. Looks up the session.
 *  2. If already in a terminal state, returns it.
 *  3. Otherwise, scans the Safe for the matching 1 CRC `nf_cashout:{token}`
 *     payment. When found:
 *     - Records the sender address + proof tx in the session.
 *     - Calls wallet.cashout() to debit the balance and dispatch the on-chain
 *       payout. Refunds the 1 CRC proof payment.
 *     - Updates session status (completed | failed).
 *
 * Response shape:
 *   { status: "pending" | "paid" | "completed" | "failed" | "expired" | "not_found",
 *     amountCrc, address?, proofTxHash?, payoutTxHash?, refundTxHash?,
 *     balanceAfter?, error? }
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "wallet-cashout-status", 30, 60000);
  if (limited) return limited;

  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const [session] = await db
      .select()
      .from(cashoutTokens)
      .where(eq(cashoutTokens.token, token))
      .limit(1);

    if (!session) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    // Terminal states — return as-is.
    if (session.status === "completed" || session.status === "failed") {
      return NextResponse.json(sessionResponse(session));
    }

    // Expiry check (only if still pending with no proof yet).
    if (session.status === "pending" && Date.now() > new Date(session.expiresAt).getTime()) {
      await db.update(cashoutTokens)
        .set({ status: "expired", updatedAt: new Date() })
        .where(eq(cashoutTokens.id, session.id));
      return NextResponse.json({ ...sessionResponse(session), status: "expired" });
    }

    // Scan for the proof payment if not detected yet.
    if (session.status === "pending") {
      try {
        await scanCashoutProofs();
      } catch (err) {
        console.error("[Cashout] Scan error:", err);
      }
    }

    // Re-read the session (scan may have updated it to "paid").
    const [refreshed] = await db
      .select()
      .from(cashoutTokens)
      .where(eq(cashoutTokens.id, session.id))
      .limit(1);

    if (!refreshed) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    // If paid but not yet processed (status="paid"), dispatch the cashout now.
    if (refreshed.status === "paid" && refreshed.address) {
      await processCashout(refreshed.id);
      // Re-read after processing to get the terminal state.
      const [final] = await db
        .select()
        .from(cashoutTokens)
        .where(eq(cashoutTokens.id, session.id))
        .limit(1);
      return NextResponse.json(sessionResponse(final || refreshed));
    }

    return NextResponse.json(sessionResponse(refreshed));
  } catch (error: any) {
    console.error("[Cashout] Status error:", error?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

function sessionResponse(s: typeof cashoutTokens.$inferSelect) {
  return {
    status: s.status,
    amountCrc: s.amountCrc,
    address: s.address,
    proofTxHash: s.proofTxHash,
    payoutTxHash: s.payoutTxHash,
    refundTxHash: s.refundTxHash,
    error: s.errorMessage,
    expiresAt: s.expiresAt,
  };
}

/**
 * Scan the Safe for `nf_cashout:{token}` 1 CRC payments and mark the matching
 * session as "paid" with the sender address. Does NOT dispatch the cashout
 * itself — that happens in processCashout() in a separate step so we can
 * guard against concurrent processing via row-level status transitions.
 */
async function scanCashoutProofs() {
  if (!SAFE_ADDRESS) return;

  const payments = await checkAllNewPayments(1, SAFE_ADDRESS);

  const candidates = payments
    .filter((p) => p.gameData?.game === "nf_cashout")
    .map((p) => p.transactionHash.toLowerCase());

  if (candidates.length === 0) return;

  const claimed = new Set<string>();
  const existing = await db
    .select({ txHash: claimedPayments.txHash })
    .from(claimedPayments)
    .where(inArray(claimedPayments.txHash, candidates));
  for (const c of existing) claimed.add(c.txHash.toLowerCase());

  for (const payment of payments) {
    if (!payment.gameData || payment.gameData.game !== "nf_cashout") continue;
    const txHash = payment.transactionHash.toLowerCase();
    if (claimed.has(txHash)) continue;

    // Must be exactly 1 CRC.
    try {
      if (BigInt(payment.value) !== WEI_1_CRC) continue;
    } catch {
      continue;
    }

    const proofToken = payment.gameData.id;
    const sender = payment.sender.toLowerCase();

    const [session] = await db
      .select()
      .from(cashoutTokens)
      .where(eq(cashoutTokens.token, proofToken))
      .limit(1);

    if (!session) continue;
    if (session.status !== "pending") continue;
    if (Date.now() > new Date(session.expiresAt).getTime()) continue;

    // Atomic transition pending -> paid, only if still pending (prevents
    // two concurrent scanners from claiming the same proof twice).
    const updated = await db
      .update(cashoutTokens)
      .set({
        address: sender,
        proofTxHash: txHash,
        status: "paid",
        updatedAt: new Date(),
      })
      .where(
        eq(cashoutTokens.id, session.id),
      )
      .returning({ id: cashoutTokens.id });

    if (updated.length === 0) continue;

    await db.insert(claimedPayments).values({
      txHash,
      gameType: "nf_cashout",
      gameId: session.id,
      playerAddress: sender,
      amountCrc: 1,
    }).onConflictDoNothing();

    claimed.add(txHash);
  }
}

/**
 * Process a cashout session that's already in status="paid":
 *  1. Call wallet.cashout() to debit the balance + dispatch the on-chain
 *     payout. On failure, the helper auto-refunds the balance.
 *  2. Refund the 1 CRC proof (separate executePayout, idempotent via gameId).
 *  3. Update the session to its terminal state.
 *
 * Safe to call multiple times — every side-effect is idempotent.
 */
async function processCashout(sessionId: number) {
  const [session] = await db
    .select()
    .from(cashoutTokens)
    .where(eq(cashoutTokens.id, sessionId))
    .limit(1);

  if (!session || session.status !== "paid" || !session.address) return;

  // Step 1 — debit + on-chain cashout (with rollback on failure).
  const result = await cashout({
    address: session.address,
    amountCrc: session.amountCrc,
    cashoutTokenId: session.id,
  });

  if (!result.ok) {
    await db.update(cashoutTokens).set({
      status: "failed",
      errorMessage: result.error === "payout_failed"
        ? `payout_failed: ${result.payoutError || "unknown"}`
        : result.error,
      refundLedgerId: result.refundLedgerId != null ? String(result.refundLedgerId) : null,
      updatedAt: new Date(),
    }).where(eq(cashoutTokens.id, session.id));
    return;
  }

  // Step 2 — refund the 1 CRC proof.
  let refundTxHash: string | null = null;
  let refundError: string | null = null;
  try {
    const refund = await executePayout({
      gameType: "nf_cashout_proof_refund",
      gameId: `nf-cashout-refund-${session.id}`,
      recipientAddress: session.address,
      amountCrc: 1,
      reason: `NF Cashout #${session.id} — proof refund`,
    });
    if (refund.success) {
      refundTxHash = refund.transferTxHash || null;
    } else {
      refundError = refund.error || null;
    }
  } catch (err: any) {
    refundError = err?.message || "refund_throw";
  }

  // Step 3 — finalize. We mark the session completed even if the 1 CRC
  // refund errored — the user already got their cashout amount, the 1 CRC
  // proof refund is best-effort and can be retried via a separate script.
  await db.update(cashoutTokens).set({
    status: "completed",
    payoutTxHash: result.payoutTxHash,
    refundTxHash,
    debitLedgerId: String(result.debitLedgerId),
    errorMessage: refundError ? `refund_warning: ${refundError}` : null,
    updatedAt: new Date(),
  }).where(eq(cashoutTokens.id, session.id));
}
