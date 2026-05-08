export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { dailySessions, players } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { allowDailyRepeatTests, generateDailyToken, todayString } from "@/lib/daily";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

function sessionPayload(session: typeof dailySessions.$inferSelect) {
  return {
    id: session.id,
    token: session.token,
    address: session.address,
    wheelPlayed: session.spinPlayed,
    wheelResult: session.spinResult ? JSON.parse(session.spinResult) : null,
  };
}

/**
 * POST /api/daily/claim-from-balance  { address }
 *
 * Balance-mode equivalent of the daily flow.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "daily-claim", 60, 60000);
  if (limited) return limited;

  try {
    const addressOr401 = await requireAuthenticatedAddress(req);
    if (addressOr401 instanceof NextResponse) return addressOr401;
    const addr = addressOr401.toLowerCase();

    const date = todayString();
    const allowRepeat = allowDailyRepeatTests();
    const claimed = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`daily-claim:${addr}:${date}`})::bigint)`);

      const [player] = await tx
        .select({ balance: players.balanceCrc })
        .from(players)
        .where(eq(players.address, addr))
        .limit(1);
      if (!player || player.balance <= 0) {
        return null;
      }

      const [existing] = await tx
        .select()
        .from(dailySessions)
        .where(and(
          eq(dailySessions.address, addr),
          eq(dailySessions.date, date),
          sql`${dailySessions.txHash} IS NOT NULL`,
        ))
        .orderBy(dailySessions.id)
        .limit(1);

      if (existing && !allowRepeat) {
        return { session: existing, alreadyClaimed: true };
      }

      const token = generateDailyToken();
      const [session] = await tx
        .insert(dailySessions)
        .values({ token, date, address: addr })
        .returning();

      await tx
        .update(dailySessions)
        .set({ txHash: `balance:${session.id}:daily` })
        .where(eq(dailySessions.id, session.id));

      return {
        session: {
          ...session,
          txHash: `balance:${session.id}:daily`,
        },
        alreadyClaimed: false,
      };
    });

    if (!claimed) {
      return NextResponse.json({ error: "no_balance" }, { status: 403 });
    }

    return NextResponse.json({
      ok: true,
      token: claimed.session.token,
      alreadyClaimed: claimed.alreadyClaimed,
      session: sessionPayload(claimed.session),
    });
  } catch (error: any) {
    console.error("[Daily] claim-from-balance error:", error?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
