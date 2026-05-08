import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { allowDailyRepeatTests, generateDailyToken, todayString } from "@/lib/daily";
import { requireAuthenticatedAddress } from "@/lib/auth/session";
import { and, eq, sql } from "drizzle-orm";

function sessionPayload(session: typeof dailySessions.$inferSelect) {
  return {
    token: session.token,
    address: session.address,
    wheelPlayed: session.spinPlayed,
    wheelResult: session.spinResult ? JSON.parse(session.spinResult) : null,
  };
}

/**
 * POST /api/daily/claim
 *
 * Free daily claim for Circles Mini App and connected users.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "daily-claim", 60, 60000);
  if (limited) return limited;

  try {
    const addressOr401 = await requireAuthenticatedAddress(req);
    if (addressOr401 instanceof NextResponse) return addressOr401;
    const normalizedAddress = addressOr401.toLowerCase();
    const date = todayString();
    const allowRepeat = allowDailyRepeatTests();

    const claimed = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`daily-claim:${normalizedAddress}:${date}`})::bigint)`);

      const [existing] = await tx
        .select()
        .from(dailySessions)
        .where(and(
          eq(dailySessions.address, normalizedAddress),
          eq(dailySessions.date, date),
          sql`${dailySessions.txHash} IS NOT NULL`,
        ))
        .orderBy(dailySessions.id)
        .limit(1);

      if (existing && !allowRepeat) {
        return { session: existing, alreadyClaimed: true };
      }

      const token = generateDailyToken();
      const [session] = await tx.insert(dailySessions).values({
        token,
        date,
        address: normalizedAddress,
        txHash: `daily-free:${token}`,
      }).returning();

      return { session, alreadyClaimed: false };
    });

    return NextResponse.json({
      ...sessionPayload(claimed.session),
      alreadyClaimed: claimed.alreadyClaimed,
      address: normalizedAddress,
    });
  } catch (error: any) {
    console.error("[Daily Claim] Error:", error.message);
    return NextResponse.json({ error: error.message || "Claim failed" }, { status: 500 });
  }
}
