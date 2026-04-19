export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crashDashRounds } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { applyAction, getVisibleState, calculatePayout, isValidCashout } from "@/lib/crash-dash";
import type { CrashDashState, CrashDashAction } from "@/lib/crash-dash";
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
    const actionType = body.action as string;
    const multiplier = body.multiplier as number | undefined;

    // Build action
    let action: CrashDashAction;
    if (actionType === "crash") {
      action = { type: "crash" };
    } else {
      action = { type: "cashout", multiplier: multiplier as number };
    }

    if (!isValidCashout(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const [round] = await db.select().from(crashDashRounds).where(eq(crashDashRounds.id, roundId)).limit(1);
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
      // Already finished — return current state
      const state = round.gameState as unknown as CrashDashState;
      const visible = getVisibleState(state);
      return NextResponse.json({
        ...visible,
        id: round.id,
        tableId: round.tableId,
        playerAddress: round.playerAddress,
        payoutStatus: round.payoutStatus,
        createdAt: round.createdAt,
        outcome: round.outcome,
        payoutCrc: round.payoutCrc,
      });
    }

    const state = round.gameState as unknown as CrashDashState;

    let newState: CrashDashState;
    try {
      newState = applyAction(state, action);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Invalid action" }, { status: 400 });
    }

    // Update DB
    const updateData: Record<string, unknown> = {
      gameState: newState as unknown as Record<string, unknown>,
      status: newState.status,
      cashoutMultiplier: newState.cashoutMultiplier,
      finalMultiplier: newState.status === "cashed_out" ? newState.cashoutMultiplier : newState.crashPoint,
      updatedAt: new Date(),
    };

    if (newState.status === "cashed_out") {
      const payoutAmount = calculatePayout(newState);
      updateData.outcome = "win";
      updateData.payoutCrc = payoutAmount;
    } else if (newState.status === "crashed") {
      updateData.outcome = "loss";
      updateData.payoutCrc = 0;
      updateData.payoutStatus = "none";
    }

    await db.update(crashDashRounds).set(updateData).where(eq(crashDashRounds.id, roundId));

    // Process payout if won
    if (newState.status === "cashed_out") {
      const payoutAmount = calculatePayout(newState);
      if (payoutAmount > 0) {
        try {
          const prize = await payPrize(round.playerAddress, payoutAmount, {
            gameType: "crash_dash",
            gameSlug: String(round.tableId),
            gameRef: `round-${round.id}`,
            sourceTxHash: round.transactionHash,
            reason: `Demurrage Dash — x${(newState.cashoutMultiplier || 0).toFixed(2)} — ${payoutAmount} CRC`,
          });

          await db.update(crashDashRounds).set({
            payoutStatus: prize.ok ? "success" : "failed",
            payoutTxHash: prize.method === "balance"
              ? (prize.ledgerId ? `balance-credit:${prize.ledgerId}` : "balance-credit:duplicate")
              : (prize.transferTxHash || null),
            errorMessage: prize.error || null,
          }).where(eq(crashDashRounds.id, roundId));
        } catch (err: any) {
          console.error("[CrashDash] Prize error:", err.message);
          await db.update(crashDashRounds).set({
            payoutStatus: "failed",
            errorMessage: err.message?.substring(0, 500),
          }).where(eq(crashDashRounds.id, roundId));
        }

        // XP for win
        try {
          const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          await fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: round.playerAddress, action: "crash_dash_win" }),
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
    console.error("[CrashDash Action] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
