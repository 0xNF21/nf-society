export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blackjackHands, blackjackTables } from "@/lib/db/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import { getVisibleState } from "@/lib/blackjack";
import type { BlackjackState } from "@/lib/blackjack";

/**
 * GET /api/blackjack/active?tableSlug=classic&token=abc123
 *
 * Returns the player's most recent non-finished hand for this table,
 * so the front-end can restore the game after a page refresh.
 */
export async function GET(req: NextRequest) {
  try {
    const tableSlug = req.nextUrl.searchParams.get("tableSlug");
    const token = req.nextUrl.searchParams.get("token");

    if (!tableSlug || !token) {
      return NextResponse.json({ hand: null });
    }

    const [table] = await db.select().from(blackjackTables)
      .where(eq(blackjackTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ hand: null });

    // Find the most recent non-finished hand with this token
    const [hand] = await db.select().from(blackjackHands)
      .where(
        and(
          eq(blackjackHands.tableId, table.id),
          eq(blackjackHands.playerToken, token),
          ne(blackjackHands.status, "finished"),
        )
      )
      .orderBy(desc(blackjackHands.createdAt))
      .limit(1);

    if (!hand) return NextResponse.json({ hand: null });

    const state = hand.gameState as unknown as BlackjackState;
    const visible = getVisibleState(state);

    return NextResponse.json({
      hand: {
        id: hand.id,
        tableId: hand.tableId,
        playerAddress: hand.playerAddress,
        betCrc: hand.betCrc,
        outcome: hand.outcome,
        payoutCrc: hand.payoutCrc,
        payoutStatus: hand.payoutStatus,
        createdAt: hand.createdAt,
        isBalancePaid: typeof hand.transactionHash === "string" && hand.transactionHash.startsWith("balance:"),
        ...visible,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ hand: null, error: error.message });
  }
}
