import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { determineSpinResult, isSafeBalanceSafe, getJackpotInfo } from "@/lib/daily";
import { executePayout } from "@/lib/payout";

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
    if (session.spinPlayed) {
      return NextResponse.json({
        result: session.spinResult ? JSON.parse(session.spinResult) : null,
        alreadyPlayed: true,
      });
    }

    // Calculate result deterministically
    const seed = session.txHash + session.address;
    let result = determineSpinResult(seed);

    // If jackpot, set crcValue to current pool total
    if (result.type === "jackpot") {
      const jackpot = await getJackpotInfo();
      result = { ...result, crcValue: Math.max(jackpot.total, 10) }; // minimum 10 CRC jackpot
    }

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

    // Save result
    await db.update(dailySessions).set({
      spinResult: JSON.stringify(result),
      spinPlayed: true,
    }).where(eq(dailySessions.id, session.id));

    // Payout if CRC won (non-blocking)
    if (result.crcValue > 0) {
      try {
        await executePayout({
          gameType: "daily-spin",
          gameId: `daily-spin-${token}`,
          recipientAddress: session.address,
          amountCrc: result.crcValue,
          reason: `Daily spin — ${result.label}`,
        });
      } catch (err: any) {
        console.error("[DailySpin] Payout error:", err.message);
      }
    }

    // XP if won (non-blocking)
    if (result.xpValue > 0) {
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await fetch(`${base}/api/players/xp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: session.address, action: "daily_spin" }),
        });
      } catch { /* XP fail silencieux */ }
    }

    return NextResponse.json({ result });
  } catch (error: any) {
    console.error("[DailySpin] Error:", error.message);
    return NextResponse.json({ error: error.message || "Spin failed" }, { status: 500 });
  }
}
