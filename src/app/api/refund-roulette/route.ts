export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rouletteRounds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { executePayout } from "@/lib/payout";

/**
 * POST /api/refund-roulette?roundId=3
 * Refund a stuck roulette round. Temporary route — delete after use.
 */
export async function POST(req: NextRequest) {
  try {
    const roundId = parseInt(req.nextUrl.searchParams.get("roundId") || "", 10);
    if (isNaN(roundId)) return NextResponse.json({ error: "roundId required" }, { status: 400 });

    const [round] = await db.select().from(rouletteRounds).where(eq(rouletteRounds.id, roundId)).limit(1);
    if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
    if (round.status !== "playing") return NextResponse.json({ error: "Round not in playing state" }, { status: 400 });

    // Refund
    const result = await executePayout({
      gameType: "roulette",
      gameId: `roulette-refund-${round.id}`,
      recipientAddress: round.playerAddress,
      amountCrc: round.betCrc,
      reason: `Roulette refund — round #${round.id} stuck`,
    });

    // Mark round as refunded
    await db.update(rouletteRounds).set({
      status: "lost",
      outcome: "refund",
      payoutCrc: round.betCrc,
      payoutStatus: result.success ? "success" : "failed",
      payoutTxHash: result.transferTxHash || null,
      errorMessage: result.error || "Refunded — UI crash",
      updatedAt: new Date(),
    }).where(eq(rouletteRounds.id, roundId));

    return NextResponse.json({ success: true, refunded: round.betCrc, txHash: result.transferTxHash });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
