export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authChallenges, payouts } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Vercel cron — reconcile auth_challenges.refund_pending against the
 * source-of-truth payouts.status.
 *
 * Why : when verify-payment broadcasts the 1 CRC refund, payouts.status
 * goes to "sending". The existing payouts-monitor cron flips it to
 * "success" or "failed" once the on-chain receipt is confirmed. This
 * route then propagates that final state back to auth_challenges :
 *
 *   payouts.status = "success" → auth_challenges.status = "refunded"
 *   payouts.status = "failed"  → auth_challenges.status = "refund_failed"
 *   else                       → leave as refund_pending (cron retries later)
 *
 * Without this reconcile, audit queries on auth_challenges always show
 * "refund_pending" forever even when the refund has long been confirmed.
 *
 * Cadence (vercel.json) : every 6 hours by default. Auth refunds are
 * audit-only, not user-facing — daily would be fine too. Adjustable.
 */

type ReconcileSummary = {
  scanned: number;
  reconciledRefunded: number;
  reconciledFailed: number;
  stillPending: number;
  orphanNoPayout: number;
  errors: number;
};

export async function GET(req: NextRequest) {
  // Standard cron auth — same pattern as payouts-monitor.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const summary: ReconcileSummary = {
    scanned: 0,
    reconciledRefunded: 0,
    reconciledFailed: 0,
    stillPending: 0,
    orphanNoPayout: 0,
    errors: 0,
  };

  try {
    // Fetch all challenges currently in refund_pending. Filter on a
    // refundTxHash IS NOT NULL is optional — without one, the broadcast
    // never reached the payouts table, which is its own audit signal.
    const pending = await db
      .select({
        id: authChallenges.id,
        txHash: authChallenges.txHash,
        refundTxHash: authChallenges.refundTxHash,
      })
      .from(authChallenges)
      .where(eq(authChallenges.status, "refund_pending"));

    summary.scanned = pending.length;
    if (pending.length === 0) {
      console.log("[CronAuthReconcile] No refund_pending challenges.");
      return NextResponse.json({ ok: true, ...summary });
    }

    for (const challenge of pending) {
      try {
        if (!challenge.txHash) {
          // Edge case : refund_pending without the original payment tx.
          // Shouldn't happen post-PR #52 (challenge.txHash is set at
          // verify-payment time), but log + skip in case of legacy rows.
          summary.errors++;
          console.warn(`[CronAuthReconcile] challenge ${challenge.id} has no txHash`);
          continue;
        }

        const payoutGameId = `nf-auth-v2-refund-${challenge.txHash}`;
        const [payout] = await db
          .select({
            status: payouts.status,
            transferTxHash: payouts.transferTxHash,
            errorMessage: payouts.errorMessage,
          })
          .from(payouts)
          .where(eq(payouts.gameId, payoutGameId))
          .limit(1);

        if (!payout) {
          // Orphan refund_pending : challenge says "refund pending" but
          // no payouts row exists. Defense in depth — should not happen
          // post-PR #52 thanks to the durable INSERT order, but we surface
          // it for ops triage.
          summary.orphanNoPayout++;
          console.warn(
            `[CronAuthReconcile] orphan refund_pending challenge ${challenge.id}, ` +
              `expected gameId=${payoutGameId}`,
          );
          continue;
        }

        if (payout.status === "success") {
          await db
            .update(authChallenges)
            .set({
              status: "refunded",
              refundTxHash: payout.transferTxHash ?? challenge.refundTxHash ?? null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(authChallenges.id, challenge.id),
                eq(authChallenges.status, "refund_pending"),
              ),
            );
          summary.reconciledRefunded++;
        } else if (payout.status === "failed") {
          await db
            .update(authChallenges)
            .set({
              status: "refund_failed",
              errorMessage: payout.errorMessage?.slice(0, 500) ?? "payout_failed",
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(authChallenges.id, challenge.id),
                eq(authChallenges.status, "refund_pending"),
              ),
            );
          summary.reconciledFailed++;
        } else {
          // status = "pending" or "sending" — broadcast not yet confirmed.
          // Leave the challenge in refund_pending and pick it up next run.
          summary.stillPending++;
        }
      } catch (err: any) {
        summary.errors++;
        console.error(
          `[CronAuthReconcile] error on challenge ${challenge.id}:`,
          err?.message ?? err,
        );
      }
    }

    console.log("[CronAuthReconcile]", JSON.stringify(summary));
    return NextResponse.json({ ok: true, ...summary });
  } catch (error: any) {
    console.error("[CronAuthReconcile] Fatal:", error?.message ?? error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? String(error), ...summary },
      { status: 500 },
    );
  }
}

