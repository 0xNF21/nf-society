export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plinkoRounds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { dropBall, getVisibleState, calculatePayout, isValidAction } from "@/lib/plinko";
import type { PlinkoState } from "@/lib/plinko";
import { executePayout } from "@/lib/payout";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const roundId = parseInt(id, 10);
    if (isNaN(roundId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await req.json();
    const playerToken = body.playerToken as string | undefined;

    // Validate action
    const action = { type: body.action as string };
    if (!isValidAction(action)) {
      return NextResponse.json({ error: "Invalid action: must be 'drop'" }, { status: 400 });
    }

    const [round] = await db.select().from(plinkoRounds).where(eq(plinkoRounds.id, roundId)).limit(1);
    if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

    // Anti-cheat: verify player token
    if (round.playerToken) {
      if (!playerToken) {
        return NextResponse.json({ error: "Player token required" }, { status: 401 });
      }
      if (playerToken !== round.playerToken) {
        return NextResponse.json({ error: "Invalid player token" }, { status: 401 });
      }
    }

    if (round.status !== "playing") {
      return NextResponse.json({ error: "Round already finished" }, { status: 400 });
    }

    const state = round.gameState as unknown as PlinkoState;

    let newState: PlinkoState;
    try {
      newState = dropBall(state);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Invalid action" }, { status: 400 });
    }

    // Update DB
    const payoutAmount = calculatePayout(newState);
    const updateData: Record<string, unknown> = {
      gameState: newState as unknown as Record<string, unknown>,
      status: newState.status,
      ballPath: newState.ballPath,
      finalBucket: newState.finalBucket,
      finalMultiplier: newState.finalMultiplier,
      updatedAt: new Date(),
    };

    if (newState.status === "won") {
      updateData.outcome = "win";
      updateData.payoutCrc = payoutAmount;
    } else if (newState.status === "lost") {
      updateData.outcome = "loss";
      updateData.payoutCrc = payoutAmount;
      updateData.payoutStatus = payoutAmount > 0 ? "pending" : "none";
    }

    await db.update(plinkoRounds).set(updateData).where(eq(plinkoRounds.id, roundId));

    // Process payout if there's any amount to pay
    if (payoutAmount > 0) {
      try {
        const payoutResult = await executePayout({
          gameType: "plinko",
          gameId: `plinko-${round.tableId}-${round.transactionHash}`,
          recipientAddress: round.playerAddress,
          amountCrc: payoutAmount,
          reason: `Plinko — x${(newState.finalMultiplier || 0).toFixed(2)} — ${payoutAmount} CRC`,
        });

        await db.update(plinkoRounds).set({
          payoutStatus: payoutResult.success ? "success" : "failed",
          payoutTxHash: payoutResult.transferTxHash || null,
          errorMessage: payoutResult.error || null,
        }).where(eq(plinkoRounds.id, roundId));
      } catch (err: any) {
        console.error("[Plinko] Payout error:", err.message);
        await db.update(plinkoRounds).set({
          payoutStatus: "failed",
          errorMessage: err.message?.substring(0, 500),
        }).where(eq(plinkoRounds.id, roundId));
      }

      // XP for win
      if (newState.status === "won") {
        try {
          const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          await fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: round.playerAddress, action: "plinko_win" }),
          });
        } catch {}
      }
    } else {
      // No payout needed (0 CRC)
      await db.update(plinkoRounds).set({ payoutStatus: "none" }).where(eq(plinkoRounds.id, roundId));
    }

    const visible = getVisibleState(newState);

    return NextResponse.json({
      ...visible,
      id: round.id,
      tableId: round.tableId,
      playerAddress: round.playerAddress,
      payoutStatus: round.payoutStatus,
      createdAt: round.createdAt,
      outcome: updateData.outcome || null,
      payoutCrc: updateData.payoutCrc ?? null,
    });
  } catch (error: any) {
    console.error("[Plinko Action] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
