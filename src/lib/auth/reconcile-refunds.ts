import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { authChallenges, payouts } from "@/lib/db/schema";

export type AuthRefundReconcileSummary = {
  scanned: number;
  reconciledRefunded: number;
  reconciledFailed: number;
  stillPending: number;
  orphanNoPayout: number;
  errors: number;
};

export async function reconcileAuthRefunds(): Promise<AuthRefundReconcileSummary> {
  const summary: AuthRefundReconcileSummary = {
    scanned: 0,
    reconciledRefunded: 0,
    reconciledFailed: 0,
    stillPending: 0,
    orphanNoPayout: 0,
    errors: 0,
  };

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
    return summary;
  }

  for (const challenge of pending) {
    try {
      if (!challenge.txHash) {
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
  return summary;
}
