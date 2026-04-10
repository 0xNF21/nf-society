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

    // Collect ALL known tx hashes to exclude
    const knownTxHashes = new Set<string>();

    // 1. All blackjack hand tx hashes (initial bets)
    const allHands = await db.select({ tx: blackjackHands.transactionHash }).from(blackjackHands);
    for (const h of allHands) knownTxHashes.add(h.tx.toLowerCase());

    // 2. All claimed payments
    const allClaimed = await db.select({ tx: claimedPayments.txHash }).from(claimedPayments);
    for (const c of allClaimed) knownTxHashes.add(c.tx.toLowerCase());

    // Fetch payments of the right amount to the table's recipient address
    const [table] = await db.select({ recipientAddress: blackjackTables.recipientAddress })
      .from(blackjackTables).where(eq(blackjackTables.id, hand.tableId)).limit(1);
    if (!table) return NextResponse.json({ found: false, error: "Table not found" });

    const payments = await checkAllNewPayments(amount, table.recipientAddress);

    console.log(`[CheckPayment] hand=${handId} amount=${amount} player=${player} recipientAddress=${table.recipientAddress} payments=${payments.length} known=${knownTxHashes.size}`);
    for (const p of payments) {
      console.log(`[CheckPayment] payment tx=${p.transactionHash.slice(0,15)} sender=${p.sender.slice(0,10)} inKnown=${knownTxHashes.has(p.transactionHash.toLowerCase())} gameData=${JSON.stringify(p.gameData)}`);
    }

    // Find a NEW payment from this player that's not in any known set
    // If token is available, also verify the payment's gameData.t matches
    let found = false;
    for (const p of payments) {
      const senderMatch = p.sender.toLowerCase() === player;
      const isKnown = knownTxHashes.has(p.transactionHash.toLowerCase());
      const tokenMismatch = token && p.gameData?.t && p.gameData.t !== token;
      console.log(`[CheckPayment] tx=${p.transactionHash.slice(0, 10)} sender=${p.sender.slice(0, 10)} senderMatch=${senderMatch} isKnown=${isKnown} tokenMismatch=${tokenMismatch} gameData=${JSON.stringify(p.gameData)}`);
      if (senderMatch && !isKnown && !tokenMismatch) {
        found = true;
        break;
      }
    }

    const debugPayments = payments.map(p => ({
      tx: p.transactionHash.slice(0, 15),
      sender: p.sender.slice(0, 10),
      value: p.value,
      inKnown: knownTxHashes.has(p.transactionHash.toLowerCase()),
      gameData: p.gameData,
    }));
    return NextResponse.json({ found, debug: { paymentsCount: payments.length, knownCount: knownTxHashes.size, recipientAddress: table.recipientAddress, payments: debugPayments } });
  } catch (error: any) {
    return NextResponse.json({ found: false, error: error.message });
  }
}
