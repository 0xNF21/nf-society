import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { dailySessions, players } from "@/lib/db/schema";
import { allowDailyRepeatTests, generateDailyToken, parseDailyWheelResult, todayString } from "@/lib/daily";
import { requireAuthenticatedAddress } from "@/lib/auth/session";
import { checkAndAwardBadges } from "@/lib/badges";
import { and, eq, sql } from "drizzle-orm";

function sessionPayload(session: typeof dailySessions.$inferSelect) {
  return {
    token: session.token,
    address: session.address,
    wheelPlayed: session.spinPlayed,
    wheelResult: parseDailyWheelResult(session.spinResult),
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

      await tx.execute(sql`
        INSERT INTO ${players} (address, xp, fragments_balance, fragments_spent, level, streak, last_seen, last_daily_checkin_at, created_at)
        VALUES (${normalizedAddress}, 0, 0, 0, 1, 1, NOW(), ${date}::date, NOW())
        ON CONFLICT (address) DO UPDATE
        SET streak = CASE
              WHEN players.last_daily_checkin_at IS NULL THEN 1
              WHEN players.last_daily_checkin_at::date = ${date}::date THEN players.streak
              WHEN players.last_daily_checkin_at::date = (${date}::date - INTERVAL '1 day')::date THEN players.streak + 1
              ELSE 1
            END,
            last_daily_checkin_at = CASE
              WHEN players.last_daily_checkin_at::date = ${date}::date THEN players.last_daily_checkin_at
              ELSE ${date}::date
            END,
            last_seen = NOW()
      `);

      return { session, alreadyClaimed: false };
    });

    if (!claimed.alreadyClaimed) {
      try {
        await checkAndAwardBadges(normalizedAddress, "daily_checkin", { hour: new Date().getHours() });
      } catch (badgeErr) {
        console.error("[Daily Claim] Badge check error:", badgeErr);
      }
    }

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
