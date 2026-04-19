export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { minesRounds, minesTables } from "@/lib/db/schema";
import { eq, and, ne, desc } from "drizzle-orm";
import { getVisibleState } from "@/lib/mines";
import type { MinesState } from "@/lib/mines";

/**
 * GET /api/mines/active?tableSlug=classic&token=abc123
 *
 * Returns the player's most recent active (playing) round for this table,
 * so the front-end can restore the game after a page refresh.
 */
export async function GET(req: NextRequest) {
  try {
    const tableSlug = req.nextUrl.searchParams.get("tableSlug");
    const token = req.nextUrl.searchParams.get("token");

    if (!tableSlug || !token) {
      return NextResponse.json({ round: null });
    }

    const [table] = await db.select().from(minesTables)
      .where(eq(minesTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ round: null });

    // Find the most recent playing round with this token
    const [round] = await db.select().from(minesRounds)
      .where(
        and(
          eq(minesRounds.tableId, table.id),
          eq(minesRounds.playerToken, token),
          ne(minesRounds.status, "finished"),
        )
      )
      .orderBy(desc(minesRounds.createdAt))
      .limit(1);

    if (!round) return NextResponse.json({ round: null });

    const state = round.gameState as unknown as MinesState;
    const visible = getVisibleState(state);

    return NextResponse.json({
      round: {
        ...visible,
        id: round.id,
        tableId: round.tableId,
        playerAddress: round.playerAddress,
        outcome: round.outcome,
        payoutCrc: round.payoutCrc,
        payoutStatus: round.payoutStatus,
        createdAt: round.createdAt,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ round: null, error: error.message });
  }
}
