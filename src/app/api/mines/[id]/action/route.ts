export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { minesRounds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { applyAction, getVisibleState, calculatePayout, isValidAction } from "@/lib/mines";
import type { MinesState, MinesAction } from "@/lib/mines";
import { creditPrize } from "@/lib/wallet";

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

    // Build action object
    let action: MinesAction;
    if (body.action === "cashout") {
      action = { type: "cashout" };
    } else if (body.action === "reveal" && typeof body.cellIndex === "number") {
      action = { type: "reveal", cellIndex: body.cellIndex };
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    if (!isValidAction(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const [round] = await db.select().from(minesRounds).where(eq(minesRounds.id, roundId)).limit(1);
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

    const state = round.gameState as unknown as MinesState;

    let newState: MinesState;
    try {
      newState = applyAction(state, action);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Invalid action" }, { status: 400 });
    }

    // Update DB
    const updateData: Record<string, unknown> = {
      gameState: newState as unknown as Record<string, unknown>,
      status: newState.status,
      gemsRevealed: newState.gemsRevealed,
      updatedAt: new Date(),
    };

    if (newState.status === "cashed_out") {
      const payoutAmount = calculatePayout(newState);
      updateData.outcome = "win";
      updateData.payoutCrc = payoutAmount;
      updateData.finalMultiplier = newState.currentMultiplier;
    } else if (newState.status === "exploded") {
      updateData.outcome = "loss";
      updateData.payoutCrc = 0;
      updateData.finalMultiplier = newState.currentMultiplier;
      updateData.payoutStatus = "none";
    }

    await db.update(minesRounds).set(updateData).where(eq(minesRounds.id, roundId));

    // Process payout if cashed out
    if (newState.status === "cashed_out") {
      const payoutAmount = calculatePayout(newState);
      if (payoutAmount > 0) {
        try {
          const creditResult = await creditPrize(
            round.playerAddress,
            payoutAmount,
            { gameType: "mines", gameSlug: String(round.tableId), gameRef: `round-${round.id}` },
          );

          await db.update(minesRounds).set({
            payoutStatus: "success",
            payoutTxHash: creditResult.ok
              ? `balance-credit:${creditResult.ledgerId}`
              : "balance-credit:duplicate",
            errorMessage: null,
          }).where(eq(minesRounds.id, roundId));
        } catch (err: any) {
          console.error("[Mines] Credit error:", err.message);
          await db.update(minesRounds).set({
            payoutStatus: "failed",
            errorMessage: err.message?.substring(0, 500),
          }).where(eq(minesRounds.id, roundId));
        }

        // XP for win
        try {
          const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          await fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: round.playerAddress, action: "mines_win" }),
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
    console.error("[Mines Action] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
