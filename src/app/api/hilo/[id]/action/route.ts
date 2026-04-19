export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hiloRounds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { applyAction, getVisibleState, calculatePayout, isValidAction } from "@/lib/hilo";
import type { HiLoState, HiLoAction } from "@/lib/hilo";
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
    const action = body.action as string;
    const playerToken = body.playerToken as string | undefined;

    if (!action || !isValidAction(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const [round] = await db.select().from(hiloRounds).where(eq(hiloRounds.id, roundId)).limit(1);
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

    const state = round.gameState as unknown as HiLoState;

    let newState: HiLoState;
    try {
      newState = applyAction(state, action as HiLoAction);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Invalid action" }, { status: 400 });
    }

    // Update DB
    const updateData: Record<string, unknown> = {
      gameState: newState as unknown as Record<string, unknown>,
      status: newState.status,
      streak: newState.streak,
      updatedAt: new Date(),
    };

    if (newState.status === "cashed_out") {
      const payoutAmount = calculatePayout(newState);
      updateData.outcome = "win";
      updateData.payoutCrc = payoutAmount;
      updateData.finalMultiplier = newState.currentMultiplier;
    } else if (newState.status === "lost") {
      updateData.outcome = "loss";
      updateData.payoutCrc = 0;
      updateData.finalMultiplier = newState.currentMultiplier;
      updateData.payoutStatus = "none";
    }

    await db.update(hiloRounds).set(updateData).where(eq(hiloRounds.id, roundId));

    // Process payout if cashed out
    if (newState.status === "cashed_out") {
      const payoutAmount = calculatePayout(newState);
      if (payoutAmount > 0) {
        try {
          const creditResult = await creditPrize(
            round.playerAddress,
            payoutAmount,
            { gameType: "hilo", gameSlug: String(round.tableId), gameRef: `round-${round.id}` },
          );

          await db.update(hiloRounds).set({
            payoutStatus: "success",
            payoutTxHash: creditResult.ok
              ? `balance-credit:${creditResult.ledgerId}`
              : "balance-credit:duplicate",
            errorMessage: null,
          }).where(eq(hiloRounds.id, roundId));
        } catch (err: any) {
          console.error("[HiLo] Credit error:", err.message);
          await db.update(hiloRounds).set({
            payoutStatus: "failed",
            errorMessage: err.message?.substring(0, 500),
          }).where(eq(hiloRounds.id, roundId));
        }

        // XP for win
        try {
          const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          await fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: round.playerAddress, action: "hilo_win" }),
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
    console.error("[HiLo Action] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
