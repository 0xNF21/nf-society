import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateDailyToken, todayString } from "@/lib/daily";

/**
 * POST /api/daily/claim
 *
 * Free daily claim for Circles Mini App users.
 * The wallet address is provided by the Mini App host (trusted iframe context).
 * One claim per address per day — enforced server-side.
 */
export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();

    if (!address || typeof address !== "string" || !address.startsWith("0x")) {
      return NextResponse.json({ error: "Valid address required" }, { status: 400 });
    }

    const normalizedAddress = address.toLowerCase();
    const date = todayString();

    // Check if this address already claimed today
    const [existing] = await db
      .select()
      .from(dailySessions)
      .where(and(
        eq(dailySessions.date, date),
        eq(dailySessions.address, normalizedAddress),
      ))
      .limit(1);

    if (existing) {
      // Already claimed — return existing session
      return NextResponse.json({
        token: existing.token,
        alreadyClaimed: true,
        address: normalizedAddress,
        scratchPlayed: existing.scratchPlayed,
        spinPlayed: existing.spinPlayed,
        scratchResult: existing.scratchResult ? JSON.parse(existing.scratchResult) : null,
        spinResult: existing.spinResult ? JSON.parse(existing.spinResult) : null,
      });
    }

    // Create new free session
    const token = generateDailyToken();
    await db.insert(dailySessions).values({
      token,
      date,
      address: normalizedAddress,
      txHash: "miniapp-free-claim",
    });

    return NextResponse.json({
      token,
      alreadyClaimed: false,
      address: normalizedAddress,
    });
  } catch (error: any) {
    console.error("[Daily Claim] Error:", error.message);
    return NextResponse.json({ error: error.message || "Claim failed" }, { status: 500 });
  }
}
