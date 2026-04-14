export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diceRounds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveRoll, getVisibleState, calculatePayout, isValidAction } from "@/lib/dice";
import type { DiceState, DiceAction } from "@/lib/dice";
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
    const target = body.target as number | undefined;
    const direction = body.direction as string | undefined;

    // Build action
    const action: DiceAction = { target: target as number, direction: direction as "over" | "under" };
    if (!isValidAction(action)) {
      return NextResponse.json({ error: "Invalid action: target (2-98) and direction (over/under) required" }, { status: 400 });
    }

    const [round] = await db.select().from(diceRounds).where(eq(diceRounds.id, roundId)).limit(1);
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

    const state = round.gameState as unknown as DiceState;

    let newState: DiceState;
    try {
      newState = resolveRoll(state, action);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Invalid action" }, { status: 400 });
    }

    // Update DB
    const updateData: Record<string, unknown> = {
      gameState: newState as unknown as Record<string, unknown>,
      status: newState.status,
      target: newState.target,
      direction: newState.direction,
      result: newState.result,
      finalMultiplier: newState.multiplier,
      updatedAt: new Date(),
    };

    if (newState.status === "won") {
      const payoutAmount = calculatePayout(newState);
      updateData.outcome = "win";
      updateData.payoutCrc = payoutAmount;
    } else if (newState.status === "lost") {
      updateData.outcome = "loss";
      updateData.payoutCrc = 0;
      updateData.payoutStatus = "none";
    }

    await db.update(diceRounds).set(updateData).where(eq(diceRounds.id, roundId));

    // Process payout if won
    if (newState.status === "won") {
      const payoutAmount = calculatePayout(newState);
      if (payoutAmount > 0) {
        try {
          const payoutResult = await executePayout({
            gameType: "dice",
            gameId: `dice-${round.tableId}-${round.transactionHash}`,
            recipientAddress: round.playerAddress,
            amountCrc: payoutAmount,
            reason: `Dice — x${(newState.multiplier || 0).toFixed(2)} — ${payoutAmount} CRC`,
          });

          await db.update(diceRounds).set({
            payoutStatus: payoutResult.success ? "success" : "failed",
            payoutTxHash: payoutResult.transferTxHash || null,
            errorMessage: payoutResult.error || null,
          }).where(eq(diceRounds.id, roundId));
        } catch (err: any) {
          console.error("[Dice] Payout error:", err.message);
          await db.update(diceRounds).set({
            payoutStatus: "failed",
            errorMessage: err.message?.substring(0, 500),
          }).where(eq(diceRounds.id, roundId));
        }

        // XP for win
        try {
          const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          await fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: round.playerAddress, action: "dice_win" }),
          });
        } catch {}
      }
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
    console.error("[Dice Action] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
