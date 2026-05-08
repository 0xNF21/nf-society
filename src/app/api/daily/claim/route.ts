import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { generateDailyToken, todayString } from "@/lib/daily";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

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
    const addressOr401 = await requireAuthenticatedAddress(req);
    if (addressOr401 instanceof NextResponse) return addressOr401;
    const normalizedAddress = addressOr401.toLowerCase();
    const date = todayString();
    const token = generateDailyToken();

    await db.insert(dailySessions).values({
      token,
      date,
      address: normalizedAddress,
      txHash: `daily-free:${token}`,
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
