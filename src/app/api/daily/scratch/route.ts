import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { determineScratchResult, isSafeBalanceSafe } from "@/lib/daily";
import { creditPrize } from "@/lib/wallet";

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
      // Return existing result
      return NextResponse.json({
        result: session.scratchResult ? JSON.parse(session.scratchResult) : null,
        alreadyPlayed: true,
      });
    }

    // Calculate result deterministically
    const seed = session.txHash + session.address;
    let result = await determineScratchResult(seed);

    // Safe balance check — replace CRC with XP if low
    if (result.crcValue > 0) {
      const safe = await isSafeBalanceSafe();
      if (!safe) {
        result = {
          ...result,
          crcValue: 0,
          xpValue: result.crcValue * 100, // Convert CRC to XP (1 CRC = 100 XP)
          label: `+${result.crcValue * 100} XP`,
          type: "xp_fallback",
        };
      }
    }

    // Save result
    await db.update(dailySessions).set({
      scratchResult: JSON.stringify(result),
      scratchPlayed: true,
    }).where(eq(dailySessions.id, session.id));

    // Credit the scratch reward to the player's balance (non-blocking).
    if (result.crcValue > 0) {
      try {
        await creditPrize(session.address, result.crcValue, {
          gameType: "daily-scratch",
          gameSlug: String(session.id),
          gameRef: `scratch-${token}`,
        });
      } catch (err: any) {
        console.error("[DailyScratch] Credit error:", err.message);
      }
    }

    // XP if won (non-blocking)
    if (result.xpValue > 0) {
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await fetch(`${base}/api/players/xp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: session.address, action: "daily_scratch", xpOverride: result.xpValue }),
        });
      } catch { /* XP fail silencieux */ }
    }

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("[DailyScratch] Error:", error.message);
    return NextResponse.json({ error: error.message || "Scratch failed" }, { status: 500 });
  }
}
