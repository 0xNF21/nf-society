import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { dailyRewardsConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { invalidateDailyCache } from "@/lib/daily";
import { checkAdminAuth } from "@/lib/admin-auth";

// GET — get scratch and spin reward tables
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-daily", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db.select().from(dailyRewardsConfig);
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    result[row.key] = typeof row.rewards === "string" ? JSON.parse(row.rewards) : row.rewards;
  }
  return NextResponse.json(result);
}

// PATCH — update a reward table (scratch or spin)
export async function PATCH(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-daily", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { key, rewards } = await req.json();
    if (!key || !Array.isArray(rewards)) {
      return NextResponse.json({ error: "key and rewards[] required" }, { status: 400 });
    }

    // Validate probabilities sum to ~1.0
    const totalProb = rewards.reduce((s: number, r: { prob: number }) => s + r.prob, 0);
    if (Math.abs(totalProb - 1.0) > 0.01) {
      return NextResponse.json({ error: `Probabilities sum to ${totalProb.toFixed(3)}, should be 1.0` }, { status: 400 });
    }

    await db.update(dailyRewardsConfig).set({
      rewards: JSON.stringify(rewards),
      updatedAt: new Date(),
    }).where(eq(dailyRewardsConfig.key, key));

    invalidateDailyCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Admin Daily] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
