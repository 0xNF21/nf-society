import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { checkAdminAuth } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { determineDailyWheelResult, generateDailyToken } from "@/lib/daily";
import { executePayout } from "@/lib/payout";
import { enforceRateLimit } from "@/lib/rate-limit";

// POST - create a test daily wheel session with real payout path (no payment needed).
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

    await db.insert(dailySessions).values({
      token,
      address: addr,
      txHash: fakeTxHash,
      date: new Date().toISOString().slice(0, 10),
      spinPlayed: false,
    });

    const wheelResult = await determineDailyWheelResult(fakeTxHash + addr);

    await db.update(dailySessions).set({
      spinResult: JSON.stringify(wheelResult),
      spinPlayed: true,
    }).where(eq(dailySessions.token, token));

    if (wheelResult.fragmentsValue > 0) {
      const fragmentsCredit = Math.floor(wheelResult.fragmentsValue);
      await db.execute(sql`
        INSERT INTO players (address, xp, fragments_balance, fragments_spent, level, streak, last_seen, created_at)
        VALUES (${addr}, 0, ${fragmentsCredit}, 0, 1, 0, NOW(), NOW())
        ON CONFLICT (address) DO UPDATE
        SET fragments_balance = players.fragments_balance + ${fragmentsCredit},
            last_seen = NOW()
      `);
    }

    let wheelPayout = null;
    if (wheelResult.crcValue > 0) {
      try {
        wheelPayout = await executePayout({
          gameType: "daily-wheel-test",
          gameId: `daily-wheel-test-${token}`,
          recipientAddress: addr,
          amountCrc: wheelResult.crcValue,
          reason: `[TEST] Daily wheel - ${wheelResult.label}`,
          payoutReason: "daily_random_crc",
        });
      } catch (e: unknown) {
        wheelPayout = { error: e instanceof Error ? e.message : "Payout failed" };
      }
    }

    return NextResponse.json({
      token,
      wheel: { result: wheelResult, payout: wheelPayout },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Test failed";
    console.error("[Admin DailyTest] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
