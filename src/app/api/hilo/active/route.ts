export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hiloRounds, hiloTables } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getVisibleState } from "@/lib/hilo";
import type { HiLoState } from "@/lib/hilo";

/**
 * GET /api/hilo/active?tableSlug=classic&token=abc123
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

    const [table] = await db.select().from(hiloTables)
      .where(eq(hiloTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ round: null });

    // Find the most recent playing round with this token
    const [round] = await db.select().from(hiloRounds)
      .where(
        and(
          eq(hiloRounds.tableId, table.id),
          eq(hiloRounds.playerToken, token),
          eq(hiloRounds.status, "playing"),
        )
      )
      .orderBy(desc(hiloRounds.createdAt))
      .limit(1);

    if (!round) return NextResponse.json({ round: null });

    const state = round.gameState as unknown as HiLoState;
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
