import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { determineScratchResult, isSafeBalanceSafe } from "@/lib/daily";
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
    if (session.scratchPlayed) {
      return NextResponse.json({
        result: session.scratchResult ? JSON.parse(session.scratchResult) : null,
        alreadyPlayed: true,
      });
    }

    const seed = session.txHash + session.address;
    let result = await determineScratchResult(seed);

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
      scratchResult: JSON.stringify(result),
      scratchPlayed: true,
    }).where(and(
      eq(dailySessions.id, session.id),
      eq(dailySessions.scratchPlayed, false),
    )).returning({ scratchResult: dailySessions.scratchResult });

    if (updated.length === 0) {
      const [current] = await db
        .select({ scratchResult: dailySessions.scratchResult })
        .from(dailySessions)
        .where(eq(dailySessions.id, session.id))
        .limit(1);
      return NextResponse.json({
        result: current?.scratchResult ? JSON.parse(current.scratchResult) : null,
        alreadyPlayed: true,
      });
    }

    if (result.crcValue > 0) {
      try {
        await payPrize(session.address, result.crcValue, {
          gameType: "daily-scratch",
          gameSlug: String(session.id),
          gameRef: `scratch-${token}`,
          sourceTxHash: session.txHash,
          reason: `Daily scratch card - ${result.label}`,
        });
      } catch (err: any) {
        console.error("[DailyScratch] Prize error:", err.message);
      }
    }

    if (result.xpValue > 0) {
      void awardPlayerXp({
        address: session.address,
        action: "daily_scratch",
        xpAmount: result.xpValue,
      }).catch(() => {});
    }

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("[DailyScratch] Error:", error.message);
    return NextResponse.json({ error: error.message || "Scratch failed" }, { status: 500 });
  }
}
