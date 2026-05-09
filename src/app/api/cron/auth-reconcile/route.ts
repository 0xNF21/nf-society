export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { reconcileAuthRefunds } from "@/lib/auth/reconcile-refunds";

/**
 * Manual endpoint for auth refund reconciliation.
 *
 * Scheduled execution piggybacks on the existing payouts-monitor cron so the
 * project keeps a single Vercel cron entry. This route remains useful for
 * manual ops checks and smoke tests.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const summary = await reconcileAuthRefunds();
    return NextResponse.json({ ok: true, ...summary });
  } catch (error: any) {
    console.error("[CronAuthReconcile] Fatal:", error?.message ?? error);
    return NextResponse.json(
      { ok: false, error: error?.message ?? String(error) },
      { status: 500 },
    );
  }
}
