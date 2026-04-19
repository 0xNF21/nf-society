export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plinkoRounds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { dropBalls, cashout, getVisibleState, calculatePayout, isValidAction } from "@/lib/plinko";
import type { PlinkoState, PlinkoAction } from "@/lib/plinko";
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
    const rawCount = body.count;
    const count = typeof rawCount === "number" && Number.isFinite(rawCount) && rawCount >= 1
      ? Math.floor(rawCount)
      : 1;

    // Validate action
    const action: PlinkoAction = { type: body.action as any };
    if (!isValidAction(action)) {
      return NextResponse.json({ error: "Invalid action: must be 'drop' or 'cashout'" }, { status: 400 });
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

    // Apply action
    let newState: PlinkoState;
    try {
      if (action.type === "drop") {
        newState = dropBalls(state, count);
      } else {
        newState = cashout(state);
      }
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Invalid action" }, { status: 400 });
    }

    // Update DB
    const updateData: Record<string, unknown> = {
      gameState: newState as unknown as Record<string, unknown>,
      status: newState.status,
      ballPath: newState.balls as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    };

    const isGameOver = newState.status === "finished" || newState.status === "cashed_out";
    if (isGameOver) {
      const payoutAmount = calculatePayout(newState);
      const totalMult = newState.totalBet > 0 ? payoutAmount / newState.totalBet : 0;
      updateData.finalMultiplier = totalMult;
      updateData.payoutCrc = payoutAmount;
      updateData.outcome = payoutAmount >= newState.totalBet ? "win" : "loss";
    }

    await db.update(plinkoRounds).set(updateData).where(eq(plinkoRounds.id, roundId));

    // Process payout when game is over
    if (isGameOver) {
      const payoutAmount = calculatePayout(newState);
      if (payoutAmount > 0) {
        try {
          const reasonSuffix = newState.status === "cashed_out"
            ? `cashout after ${newState.balls.length}/${newState.ballCount} balls`
            : `${newState.balls.length} balls`;
          const creditResult = await creditPrize(
            round.playerAddress,
            payoutAmount,
            { gameType: "plinko", gameSlug: String(round.tableId), gameRef: `round-${round.id}` },
          );

          await db.update(plinkoRounds).set({
            payoutStatus: "success",
            payoutTxHash: creditResult.ok
              ? `balance-credit:${creditResult.ledgerId}`
              : "balance-credit:duplicate",
            errorMessage: null,
          }).where(eq(plinkoRounds.id, roundId));
        } catch (err: any) {
          console.error("[Plinko] Credit error:", err.message);
          await db.update(plinkoRounds).set({
            payoutStatus: "failed",
            errorMessage: err.message?.substring(0, 500),
          }).where(eq(plinkoRounds.id, roundId));
        }

        // XP for any positive outcome
        if (payoutAmount >= newState.totalBet) {
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
        await db.update(plinkoRounds).set({ payoutStatus: "none" }).where(eq(plinkoRounds.id, roundId));
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
    console.error("[Plinko Action] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
