export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { dailySessions, players } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateDailyToken, todayString } from "@/lib/daily";
import { awardPlayerXp } from "@/lib/xp-server";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

/**
 * POST /api/daily/claim-from-balance  { address }
 *
 * Balance-mode equivalent of the daily flow.
 * TEMP TEST BYPASS: creates a fresh confirmed session on every call so daily
 * draw tests can be chained without waiting 24h.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "daily-claim", 60, 60000);
  if (limited) return limited;

  try {
    const addressOr401 = await requireAuthenticatedAddress(req);
    if (addressOr401 instanceof NextResponse) return addressOr401;
    const addr = addressOr401.toLowerCase();

    const [player] = await db
      .select({ balance: players.balanceCrc })
      .from(players)
      .where(eq(players.address, addr))
      .limit(1);
    if (!player || player.balance <= 0) {
      return NextResponse.json({ error: "no_balance" }, { status: 403 });
    }

    const date = todayString();
    const token = generateDailyToken();
    const [inserted] = await db
      .insert(dailySessions)
      .values({ token, date, address: addr })
      .returning({ id: dailySessions.id });
    const sessionId = inserted.id;

    await db
      .update(dailySessions)
      .set({ txHash: `balance:${sessionId}:daily-test` })
      .where(eq(dailySessions.id, sessionId));

    void awardPlayerXp({ address: addr, action: "daily_checkin" }).catch(() => {});

    return NextResponse.json({
      ok: true,
      token,
      alreadyClaimed: false,
      session: { id: sessionId },
    });
  } catch (error: any) {
    console.error("[Daily] claim-from-balance error:", error?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
