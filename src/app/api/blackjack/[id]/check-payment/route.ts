export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blackjackHands, blackjackTables, claimedPayments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";

/**
 * GET /api/blackjack/[id]/check-payment?amount=5&player=0x...
 *
 * Checks if an additional payment (for double/split) has arrived
 * from the player to the Safe. Excludes ALL already-known tx hashes
 * (initial bet + all claimed payments). Returns { found: true } if detected.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const handId = parseInt(id, 10);
    const amount = parseInt(req.nextUrl.searchParams.get("amount") || "0", 10);
    const player = req.nextUrl.searchParams.get("player")?.toLowerCase();

    if (isNaN(handId) || amount <= 0 || !player) {
      return NextResponse.json({ found: false, error: "Invalid params" });
    }

    const token = req.nextUrl.searchParams.get("token");

    const [hand] = await db.select().from(blackjackHands).where(eq(blackjackHands.id, handId)).limit(1);
    if (!hand) return NextResponse.json({ found: false });

    // Verify player token
    if (hand.playerToken && token !== hand.playerToken) {
      return NextResponse.json({ found: false, error: "Invalid token" });
    }

    // Collect known tx hashes to exclude (scoped to this table + blackjack claims)
    const knownTxHashes = new Set<string>();

    // 1. Blackjack hand tx hashes for this table only
    const tableHands = await db.select({ tx: blackjackHands.transactionHash })
      .from(blackjackHands)
      .where(eq(blackjackHands.tableId, hand.tableId));
    for (const h of tableHands) knownTxHashes.add(h.tx.toLowerCase());

    // 2. Blackjack claimed payments only
    const bjClaimed = await db.select({ tx: claimedPayments.txHash })
      .from(claimedPayments)
      .where(eq(claimedPayments.gameType, "blackjack"));
    for (const c of bjClaimed) knownTxHashes.add(c.tx.toLowerCase());

    // Fetch payments of the right amount to the table's recipient address
    const [table] = await db.select({ recipientAddress: blackjackTables.recipientAddress })
      .from(blackjackTables).where(eq(blackjackTables.id, hand.tableId)).limit(1);
    if (!table) return NextResponse.json({ found: false, error: "Table not found" });

    // Use blackjack-specific start block to avoid scanning old payments
    const BLACKJACK_START_BLOCK = "0x2B7DE5C";
    const payments = await checkAllNewPayments(amount, table.recipientAddress, BLACKJACK_START_BLOCK);

    // Find a NEW payment from this player that's not in any known set
    // If token is available, also verify the payment's gameData.t matches
    let found = false;
    let foundTxHash = "";
    for (const p of payments) {
      if (p.sender.toLowerCase() !== player) continue;
      if (knownTxHashes.has(p.transactionHash.toLowerCase())) continue;
      if (token && p.gameData?.t && p.gameData.t !== token) continue;
      found = true;
      foundTxHash = p.transactionHash.toLowerCase();
      break;
    }

    // Claim the found tx to prevent reuse on subsequent checks
    if (found && foundTxHash) {
      await db.insert(claimedPayments).values({
        txHash: foundTxHash,
        gameType: "blackjack",
        gameId: hand.tableId,
        playerAddress: player,
        amountCrc: amount,
      }).onConflictDoNothing();
    }

    return NextResponse.json({ found });
  } catch (error: any) {
    return NextResponse.json({ found: false, error: error.message });
  }
}
