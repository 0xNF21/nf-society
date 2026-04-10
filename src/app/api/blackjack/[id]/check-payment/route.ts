export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blackjackHands, claimedPayments } from "@/lib/db/schema";
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

    const [hand] = await db.select().from(blackjackHands).where(eq(blackjackHands.id, handId)).limit(1);
    if (!hand) return NextResponse.json({ found: false });

    // Collect ALL known tx hashes to exclude
    const knownTxHashes = new Set<string>();

    // 1. All blackjack hand tx hashes (initial bets)
    const allHands = await db.select({ tx: blackjackHands.transactionHash }).from(blackjackHands);
    for (const h of allHands) knownTxHashes.add(h.tx.toLowerCase());

    // 2. All claimed payments
    const allClaimed = await db.select({ tx: claimedPayments.txHash }).from(claimedPayments);
    for (const c of allClaimed) knownTxHashes.add(c.tx.toLowerCase());

    // Fetch payments of the right amount to the Safe
    const safeAddress = process.env.SAFE_ADDRESS || "";
    const payments = await checkAllNewPayments(amount, safeAddress);

    // Find a NEW payment from this player that's not in any known set
    const found = payments.some(p =>
      p.sender.toLowerCase() === player &&
      !knownTxHashes.has(p.transactionHash.toLowerCase())
    );

    return NextResponse.json({ found });
  } catch (error: any) {
    return NextResponse.json({ found: false, error: error.message });
  }
}
