import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { allowDailyRepeatTests, determineDailyWheelResult, isSafeBalanceSafe } from "@/lib/daily";
import { payPrize } from "@/lib/wallet";
import { awardPlayerXp } from "@/lib/xp-server";

export async function POST(req: NextRequest) {
  try {
    const { token } = await req.json();
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const [session] = await db
      .select()
      .from(dailySessions)
      .where(eq(dailySessions.token, token))
      .limit(1);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (!session.address || !session.txHash) {
      return NextResponse.json({ error: "Payment not confirmed yet" }, { status: 400 });
    }

    if (!allowDailyRepeatTests()) {
      const [canonical] = await db
        .select({
          id: dailySessions.id,
          token: dailySessions.token,
          wheelResult: dailySessions.spinResult,
        })
        .from(dailySessions)
        .where(and(
          eq(dailySessions.address, session.address),
          eq(dailySessions.date, session.date),
          sql`${dailySessions.txHash} IS NOT NULL`,
        ))
        .orderBy(dailySessions.id)
        .limit(1);

      if (canonical && canonical.id !== session.id) {
        return NextResponse.json({
          error: "daily_already_claimed",
          alreadyClaimed: true,
          token: canonical.token,
          result: canonical.wheelResult ? JSON.parse(canonical.wheelResult) : null,
        }, { status: 409 });
      }
    }

    if (session.spinPlayed) {
      return NextResponse.json({
        result: session.spinResult ? JSON.parse(session.spinResult) : null,
        alreadyPlayed: true,
      });
    }

    const seed = session.txHash + session.address;
    let result = await determineDailyWheelResult(seed);

    if (result.crcValue > 0) {
      const safe = await isSafeBalanceSafe();
      if (!safe) {
        result = {
          ...result,
          crcValue: 0,
          xpValue: result.crcValue * 100,
          label: `+${result.crcValue * 100} XP`,
          type: "xp_fallback",
        };
      }
    }

    const updated = await db.update(dailySessions).set({
      spinResult: JSON.stringify(result),
      spinPlayed: true,
    }).where(and(
      eq(dailySessions.id, session.id),
      eq(dailySessions.spinPlayed, false),
    )).returning({ wheelResult: dailySessions.spinResult });

    if (updated.length === 0) {
      const [current] = await db
        .select({ wheelResult: dailySessions.spinResult })
        .from(dailySessions)
        .where(eq(dailySessions.id, session.id))
        .limit(1);
      return NextResponse.json({
        result: current?.wheelResult ? JSON.parse(current.wheelResult) : null,
        alreadyPlayed: true,
      });
    }

    if (result.crcValue > 0) {
      try {
        await payPrize(session.address, result.crcValue, {
          gameType: "daily-wheel",
          gameSlug: String(session.id),
          gameRef: `wheel-${token}`,
          sourceTxHash: session.txHash,
          reason: `Daily wheel - ${result.label}`,
        });
      } catch (err: any) {
        console.error("[DailyWheel] Prize error:", err.message);
      }
    }

    if (result.xpValue > 0) {
      void awardPlayerXp({
        address: session.address,
        action: "daily_wheel",
        xpAmount: result.xpValue,
        sourceType: "daily",
        sourceId: `session:${session.id}:wheel`,
        metadata: { token },
      }).catch(() => {});
    }

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("[DailyWheel] Error:", error.message);
    return NextResponse.json({ error: error.message || "Wheel failed" }, { status: 500 });
  }
}
