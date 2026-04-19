export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blackjackHands, blackjackTables, claimedPayments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { applyAction, getVisibleState, calculateTotalBet } from "@/lib/blackjack";
import type { BlackjackState, Action } from "@/lib/blackjack";
import { payPrize } from "@/lib/wallet";
import { checkAllNewPayments } from "@/lib/circles";

const VALID_ACTIONS: Action[] = ["hit", "stand", "double", "split", "insurance"];
const PAID_ACTIONS: Action[] = ["double", "split"];
// Blackjack-specific start block — must match scan/check-payment
const BLACKJACK_START_BLOCK = "0x2B7DE5C";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const handId = parseInt(id, 10);
    if (isNaN(handId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const body = await req.json();
    const action = body.action as Action;
    const playerToken = body.playerToken as string | undefined;
    const paymentTxHash = (body.paymentTxHash as string | undefined)?.toLowerCase();
    if (!action || !VALID_ACTIONS.includes(action)) {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    const [hand] = await db.select().from(blackjackHands).where(eq(blackjackHands.id, handId)).limit(1);
    if (!hand) return NextResponse.json({ error: "Hand not found" }, { status: 404 });

    // Anti-cheat: verify player token
    if (hand.playerToken) {
      if (!playerToken) {
        return NextResponse.json({ error: "Player token required" }, { status: 401 });
      }
      if (playerToken !== hand.playerToken) {
        return NextResponse.json({ error: "Invalid player token" }, { status: 401 });
      }
    }

    if (hand.status === "finished") {
      return NextResponse.json({ error: "Hand already finished" }, { status: 400 });
    }
    if (hand.status !== "playing") {
      return NextResponse.json({ error: "Hand not in playing state" }, { status: 400 });
    }

    // For paid actions (double/split), verify + claim the extra payment
    // atomically BEFORE applying the action. This prevents orphan claims
    // if the client missed the check-payment response.
    if (PAID_ACTIONS.includes(action)) {
      if (!paymentTxHash) {
        return NextResponse.json({ error: "Payment tx hash required for this action" }, { status: 400 });
      }

      // Lookup table for recipient address
      const [table] = await db.select({ recipientAddress: blackjackTables.recipientAddress })
        .from(blackjackTables).where(eq(blackjackTables.id, hand.tableId)).limit(1);
      if (!table) {
        return NextResponse.json({ error: "Table not found" }, { status: 404 });
      }

      // Verify tx on-chain: must be from the player, correct amount, with matching token
      const payments = await checkAllNewPayments(hand.betCrc, table.recipientAddress, BLACKJACK_START_BLOCK);
      const tx = payments.find(p => p.transactionHash.toLowerCase() === paymentTxHash);
      if (!tx) {
        return NextResponse.json({ error: "Payment tx not found on-chain" }, { status: 400 });
      }
      if (tx.sender.toLowerCase() !== hand.playerAddress.toLowerCase()) {
        return NextResponse.json({ error: "Payment tx sender mismatch" }, { status: 400 });
      }
      if (hand.playerToken && tx.gameData?.t && tx.gameData.t !== hand.playerToken) {
        return NextResponse.json({ error: "Payment tx token mismatch" }, { status: 400 });
      }

      // Atomic claim — onConflictDoNothing returns [] if the tx was already claimed
      const claimed = await db.insert(claimedPayments).values({
        txHash: paymentTxHash,
        gameType: "blackjack",
        gameId: hand.tableId,
        playerAddress: hand.playerAddress,
        amountCrc: hand.betCrc,
      }).onConflictDoNothing().returning({ txHash: claimedPayments.txHash });

      if (claimed.length === 0) {
        return NextResponse.json({ error: "Payment tx already consumed" }, { status: 409 });
      }
    }

    const state = hand.gameState as unknown as BlackjackState;

    let newState: BlackjackState;
    try {
      newState = applyAction(state, action);
    } catch (err: any) {
      return NextResponse.json({ error: err.message || "Invalid action" }, { status: 400 });
    }

    // Update DB
    const updateData: Record<string, unknown> = {
      gameState: newState as unknown as Record<string, unknown>,
      status: newState.status,
      updatedAt: new Date(),
    };

    if (newState.status === "finished") {
      // Determine overall outcome
      const outcomes = newState.playerHands.map(h => h.outcome).filter(Boolean);
      const mainOutcome = outcomes.includes("blackjack") ? "blackjack"
        : outcomes.includes("win") ? "win"
        : outcomes.every(o => o === "bust" || o === "loss") ? "loss"
        : outcomes.includes("push") ? "push"
        : "loss";

      updateData.outcome = mainOutcome;
      updateData.payoutCrc = newState.totalPayout;
    }

    await db.update(blackjackHands).set(updateData).where(eq(blackjackHands.id, handId));

    // Process payout if finished
    if (newState.status === "finished" && newState.totalPayout > 0) {
      try {
        const prize = await payPrize(hand.playerAddress, newState.totalPayout, {
          gameType: "blackjack",
          gameSlug: String(hand.tableId),
          gameRef: `hand-${hand.id}`,
          sourceTxHash: hand.transactionHash,
          reason: `Blackjack — ${updateData.outcome} — ${newState.totalPayout} CRC`,
        });

        await db.update(blackjackHands).set({
          payoutStatus: prize.ok ? "success" : "failed",
          payoutTxHash: prize.method === "balance"
            ? (prize.ledgerId ? `balance-credit:${prize.ledgerId}` : "balance-credit:duplicate")
            : (prize.transferTxHash || null),
          errorMessage: prize.error || null,
        }).where(eq(blackjackHands.id, handId));
      } catch (err: any) {
        console.error("[Blackjack] Prize error:", err.message);
        await db.update(blackjackHands).set({
          payoutStatus: "failed",
          errorMessage: err.message?.substring(0, 500),
        }).where(eq(blackjackHands.id, handId));
      }

      // XP for win — fire and forget (don't block the response).
      if (updateData.outcome === "win" || updateData.outcome === "blackjack") {
        const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        void fetch(`${base}/api/players/xp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: hand.playerAddress, action: "blackjack_win" }),
        }).catch(() => {});
      }
    }

    const visible = getVisibleState(newState);

    return NextResponse.json({
      id: hand.id,
      tableId: hand.tableId,
      playerAddress: hand.playerAddress,
      betCrc: hand.betCrc,
      payoutStatus: hand.payoutStatus,
      createdAt: hand.createdAt,
      ...visible,
      outcome: updateData.outcome || null,
      payoutCrc: newState.totalPayout,
    });
  } catch (error: any) {
    console.error("[Blackjack Action] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
