import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { determineSpinResult, isSafeBalanceSafe } from "@/lib/daily";
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
    if (!session.scratchPlayed) {
      return NextResponse.json({ error: "Scratch must be played before spin" }, { status: 400 });
    }
    if (session.spinPlayed) {
      return NextResponse.json({
        result: session.spinResult ? JSON.parse(session.spinResult) : null,
        alreadyPlayed: true,
      });
    }

    // Calculate result deterministically
    const seed = session.txHash + session.address;
    let result = await determineSpinResult(seed);


    // Safe balance check
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
    )).returning({ spinResult: dailySessions.spinResult });

    if (updated.length === 0) {
      const [current] = await db
        .select({ spinResult: dailySessions.spinResult })
        .from(dailySessions)
        .where(eq(dailySessions.id, session.id))
        .limit(1);
      return NextResponse.json({
        result: current?.spinResult ? JSON.parse(current.spinResult) : null,
        alreadyPlayed: true,
      });
    }

    // Pay the spin reward via the same method as the daily claim.
    if (result.crcValue > 0) {
      try {
        await payPrize(session.address, result.crcValue, {
          gameType: "daily-spin",
          gameSlug: String(session.id),
          gameRef: `spin-${token}`,
          sourceTxHash: session.txHash,
          reason: `Daily spin — ${result.label}`,
        });
      } catch (err: any) {
        console.error("[DailySpin] Prize error:", err.message);
      }
    }

    // XP if won (non-blocking)
    if (result.xpValue > 0) {
      void awardPlayerXp({
        address: session.address,
        action: "daily_spin",
        xpAmount: result.xpValue,
      }).catch(() => {});
    }

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("[DailySpin] Error:", error.message);
    return NextResponse.json({ error: error.message || "Spin failed" }, { status: 500 });
  }
}
