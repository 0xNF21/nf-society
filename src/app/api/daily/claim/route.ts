import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { generateDailyToken, todayString } from "@/lib/daily";

/**
 * POST /api/daily/claim
 *
 * Free daily claim for Circles Mini App and connected users.
 * TEMP TEST BYPASS: creates a fresh daily session on every call so repeated
 * draw tests can be chained without waiting 24h.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "daily-claim", 60, 60000);
  if (limited) return limited;

  try {
    const { address } = await req.json();

    if (!address || typeof address !== "string" || !address.startsWith("0x")) {
      return NextResponse.json({ error: "Valid address required" }, { status: 400 });
    }

    const normalizedAddress = address.toLowerCase();
    const date = todayString();
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
