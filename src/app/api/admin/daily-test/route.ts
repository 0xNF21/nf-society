import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateDailyToken, determineScratchResult, determineSpinResult } from "@/lib/daily";
import { executePayout } from "@/lib/payout";
import { checkAdminAuth } from "@/lib/admin-auth";

// POST — create a test daily session with real scratch/spin/payout (no payment needed)
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-daily-test", 10, 60000);
  if (limited) return limited;

  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { address } = await req.json();
    if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });

    const addr = address.toLowerCase();
    const token = generateDailyToken();
    const fakeTxHash = `0xTEST${Date.now().toString(16)}${Math.random().toString(16).slice(2, 10)}`;

    // Create a confirmed session directly (skip payment)
    await db.insert(dailySessions).values({
      token,
      address: addr,
      txHash: fakeTxHash,
      date: new Date().toISOString().slice(0, 10),
      scratchPlayed: false,
      spinPlayed: false,
    });

    // Run scratch
    const scratchSeed = fakeTxHash + addr;
    const scratchResult = await determineScratchResult(scratchSeed);

    await db.update(dailySessions).set({
      scratchResult: JSON.stringify(scratchResult),
      scratchPlayed: true,
    }).where(eq(dailySessions.token, token));

    // Payout scratch CRC
    let scratchPayout = null;
    if (scratchResult.crcValue > 0) {
      try {
        scratchPayout = await executePayout({
          gameType: "daily-scratch-test",
          gameId: `daily-scratch-test-${token}`,
          recipientAddress: addr,
          amountCrc: scratchResult.crcValue,
          reason: `[TEST] Daily scratch — ${scratchResult.label}`,
        });
      } catch (e: unknown) {
        scratchPayout = { error: e instanceof Error ? e.message : "Payout failed" };
      }
    }

    // Run spin
    const spinSeed = fakeTxHash + addr;
    const spinResult = await determineSpinResult(spinSeed);

    await db.update(dailySessions).set({
      spinResult: JSON.stringify(spinResult),
      spinPlayed: true,
    }).where(eq(dailySessions.token, token));

    // Payout spin CRC
    let spinPayout = null;
    if (spinResult.crcValue > 0) {
      try {
        spinPayout = await executePayout({
          gameType: "daily-spin-test",
          gameId: `daily-spin-test-${token}`,
          recipientAddress: addr,
          amountCrc: spinResult.crcValue,
          reason: `[TEST] Daily spin — ${spinResult.label}`,
        });
      } catch (e: unknown) {
        spinPayout = { error: e instanceof Error ? e.message : "Payout failed" };
      }
    }

    return NextResponse.json({
      token,
      scratch: { result: scratchResult, payout: scratchPayout },
      spin: { result: spinResult, payout: spinPayout },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Test failed";
    console.error("[Admin DailyTest] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
