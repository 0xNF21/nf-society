export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payouts } from "@/lib/db/schema";
import { eq, and, lt } from "drizzle-orm";
import { retryPayout, verifyPendingPayout } from "@/lib/payout";

const MAX_RETRY_ATTEMPTS = 3;

/**
 * Vercel cron — runs every 5 min (see vercel.json).
 * Step 1: verify "sending" payouts older than 30s (reconcile fire-and-forget broadcasts)
 * Step 2: retry "failed" payouts with attempts < 3 and last update > 2 min ago
 */
export async function GET(req: NextRequest) {
  // Vercel automatically injects Authorization: Bearer <CRON_SECRET> for scheduled cron jobs.
  // Allow manual hits in development (no secret configured) for testing.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const summary = {
    sendingChecked: 0,
    confirmed: 0,
    stillPending: 0,
    confirmedFailed: 0,
    failedRetried: 0,
    retrySucceeded: 0,
    retryFailed: 0,
    maxAttemptsReached: 0,
  };

  try {
    // Step 1: verify all "sending" payouts older than 30s
    const sendingCutoff = new Date(Date.now() - 30 * 1000);
    const sendingRows = await db
      .select({ id: payouts.id })
      .from(payouts)
      .where(and(eq(payouts.status, "sending"), lt(payouts.updatedAt, sendingCutoff)));

    summary.sendingChecked = sendingRows.length;
    for (const { id } of sendingRows) {
      try {
        const res = await verifyPendingPayout(id);
        if (res.status === "success") summary.confirmed++;
        else if (res.status === "still_pending") summary.stillPending++;
        else summary.confirmedFailed++;
      } catch (err: any) {
        console.error(`[CronMonitor] verify ${id} error:`, err.message);
      }
    }

    // Step 2: retry "failed" payouts with attempts < 3, updated > 2 min ago
    const retryCutoff = new Date(Date.now() - 2 * 60 * 1000);
    const failedRows = await db
      .select({ id: payouts.id, attempts: payouts.attempts })
      .from(payouts)
      .where(and(eq(payouts.status, "failed"), lt(payouts.updatedAt, retryCutoff)));

    for (const row of failedRows) {
      if (row.attempts >= MAX_RETRY_ATTEMPTS) {
        summary.maxAttemptsReached++;
        continue;
      }
      summary.failedRetried++;
      try {
        const res = await retryPayout(row.id);
        if (res.success) summary.retrySucceeded++;
        else summary.retryFailed++;
      } catch (err: any) {
        console.error(`[CronMonitor] retry ${row.id} error:`, err.message);
        summary.retryFailed++;
      }
    }

    console.log("[CronMonitor]", JSON.stringify(summary));
    return NextResponse.json({ ok: true, ...summary });
  } catch (error: any) {
    console.error("[CronMonitor] Fatal:", error.message);
    return NextResponse.json({ ok: false, error: error.message, ...summary }, { status: 500 });
  }
}
