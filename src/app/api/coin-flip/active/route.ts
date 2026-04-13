export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coinFlipResults, coinFlipTables } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

/**
 * GET /api/coin-flip/active?tableSlug=classic&token=abc123
 *
 * Returns the player's most recent coin flip result for this table,
 * so the front-end can restore the result after a page refresh.
 */
export async function GET(req: NextRequest) {
  try {
    const tableSlug = req.nextUrl.searchParams.get("tableSlug");
    const token = req.nextUrl.searchParams.get("token");

    if (!tableSlug || !token) {
      return NextResponse.json({ result: null });
    }

    const [table] = await db.select().from(coinFlipTables)
      .where(eq(coinFlipTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ result: null });

    // Find the most recent result with this token (created in last 5 minutes)
    const [flip] = await db.select().from(coinFlipResults)
      .where(
        and(
          eq(coinFlipResults.tableId, table.id),
          eq(coinFlipResults.playerToken, token),
        )
      )
      .orderBy(desc(coinFlipResults.createdAt))
      .limit(1);

    if (!flip) return NextResponse.json({ result: null });

    // Only return if recent (within 5 minutes)
    const age = Date.now() - new Date(flip.createdAt).getTime();
    if (age > 5 * 60 * 1000) return NextResponse.json({ result: null });

    return NextResponse.json({
      result: {
        id: flip.id,
        playerAddress: flip.playerAddress,
        betCrc: flip.betCrc,
        playerChoice: flip.playerChoice,
        coinResult: flip.coinResult,
        outcome: flip.outcome,
        payoutCrc: flip.payoutCrc,
        payoutStatus: flip.payoutStatus,
        createdAt: flip.createdAt,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ result: null, error: error.message });
  }
}
