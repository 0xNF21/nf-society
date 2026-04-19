export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rouletteRounds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { resolveRoll, getVisibleState, calculatePayout, isValidAction } from "@/lib/roulette";
import type { RouletteState, RouletteAction } from "@/lib/roulette";
import { payPrize } from "@/lib/wallet";

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
    const bets = body.bets as unknown;

    const [round] = await db.select().from(rouletteRounds).where(eq(rouletteRounds.id, roundId)).limit(1);
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

    // Build action
    const action = { bets: (bets || []) as RouletteAction["bets"] };
    if (!isValidAction(action, round.betCrc)) {
      return NextResponse.json({ error: "Invalid bets" }, { status: 400 });
    }

    const state = round.gameState as unknown as RouletteState;

    let newState: RouletteState;
    try {
      newState = resolveRoll(state, action);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Invalid action" }, { status: 400 });
    }

    // Update DB
    const updateData: Record<string, unknown> = {
      gameState: newState as unknown as Record<string, unknown>,
      status: newState.status,
      bets: newState.bets,
      result: newState.result,
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

    await db.update(rouletteRounds).set(updateData).where(eq(rouletteRounds.id, roundId));

    // Pay the win. Asymmetric: balance-paid round -> balance credit, on-chain round -> on-chain payout.
    if (newState.status === "won") {
      const payoutAmount = calculatePayout(newState);
      if (payoutAmount > 0) {
        try {
          const prize = await payPrize(round.playerAddress, payoutAmount, {
            gameType: "roulette",
            gameSlug: String(round.tableId),
            gameRef: `round-${round.id}`,
            sourceTxHash: round.transactionHash,
            reason: `Roulette — #${newState.result} — ${payoutAmount} CRC`,
          });

          await db.update(rouletteRounds).set({
            payoutStatus: prize.ok ? "success" : "failed",
            payoutTxHash: prize.method === "balance"
              ? (prize.ledgerId ? `balance-credit:${prize.ledgerId}` : "balance-credit:duplicate")
              : (prize.transferTxHash || null),
            errorMessage: prize.error || null,
          }).where(eq(rouletteRounds.id, roundId));
        } catch (err: any) {
          console.error("[Roulette] Prize error:", err.message);
          await db.update(rouletteRounds).set({
            payoutStatus: "failed",
            errorMessage: err.message?.substring(0, 500),
          }).where(eq(rouletteRounds.id, roundId));
        }

        // XP for win
        try {
          const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          await fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: round.playerAddress, action: "roulette_win" }),
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
    console.error("[Roulette Action] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
