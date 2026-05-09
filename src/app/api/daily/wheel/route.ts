import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { dailySessions, players } from "@/lib/db/schema";
import { allowDailyRepeatTests, determineDailyWheelResult, isSafeBalanceSafe, parseDailyWheelResult } from "@/lib/daily";
import { payPrize } from "@/lib/wallet";

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
    const sessionAddress = session.address.toLowerCase();

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
          result: parseDailyWheelResult(canonical.wheelResult),
        }, { status: 409 });
      }
    }

    if (session.spinPlayed) {
      return NextResponse.json({
        result: parseDailyWheelResult(session.spinResult),
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
          fragmentsValue: result.crcValue * 100,
          label: `+${result.crcValue * 100} Fragments`,
          type: "fragments_fallback",
        };
      }
    }

    const updated = await db.transaction(async (tx) => {
      const rows = await tx.update(dailySessions).set({
        spinResult: JSON.stringify(result),
        spinPlayed: true,
      }).where(and(
        eq(dailySessions.id, session.id),
        eq(dailySessions.spinPlayed, false),
      )).returning({ wheelResult: dailySessions.spinResult });

      if (rows.length > 0 && result.fragmentsValue > 0) {
        const fragmentsCredit = Math.floor(result.fragmentsValue);
        await tx.execute(sql`
          INSERT INTO ${players} (address, xp, fragments_balance, fragments_spent, level, streak, last_seen, created_at)
          VALUES (${sessionAddress}, 0, ${fragmentsCredit}, 0, 1, 0, NOW(), NOW())
          ON CONFLICT (address) DO UPDATE
          SET fragments_balance = players.fragments_balance + ${fragmentsCredit},
              last_seen = NOW()
        `);
      }

      return rows;
    });

    if (updated.length === 0) {
      const [current] = await db
        .select({ wheelResult: dailySessions.spinResult })
        .from(dailySessions)
        .where(eq(dailySessions.id, session.id))
        .limit(1);
      return NextResponse.json({
        result: parseDailyWheelResult(current?.wheelResult),
        alreadyPlayed: true,
      });
    }

    let payout: Awaited<ReturnType<typeof payPrize>> | null = null;
    if (result.crcValue > 0) {
      try {
        payout = await payPrize(session.address, result.crcValue, {
          gameType: "daily-wheel",
          gameSlug: String(session.id),
          gameRef: `wheel-${token}`,
          sourceTxHash: session.txHash,
          reason: `Daily wheel - ${result.label}`,
          payoutReason: "daily_random_crc",
        });
        if (!payout.ok) {
          console.error("[DailyWheel] Prize failed:", payout.error);
        }
      } catch (err: any) {
        console.error("[DailyWheel] Prize error:", err.message);
        payout = {
          method: "onchain",
          ok: false,
          error: err.message || "Prize payout failed",
        };
      }
    }

    return NextResponse.json({ result, payout });
  } catch (error: any) {
    console.error("[DailyWheel] Error:", error.message);
    return NextResponse.json({ error: error.message || "Wheel failed" }, { status: 500 });
  }
}
