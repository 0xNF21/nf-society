export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rouletteRounds, rouletteTables } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { getVisibleState } from "@/lib/roulette";
import type { RouletteState } from "@/lib/roulette";

/**
 * GET /api/roulette/active?tableSlug=classic&token=abc123
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

    const [table] = await db.select().from(rouletteTables)
      .where(eq(rouletteTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ round: null });

    // Find the most recent playing round with this token
    const [round] = await db.select().from(rouletteRounds)
      .where(
        and(
          eq(rouletteRounds.tableId, table.id),
          eq(rouletteRounds.playerToken, token),
          eq(rouletteRounds.status, "playing"),
        )
      )
      .orderBy(desc(rouletteRounds.createdAt))
      .limit(1);

    if (!round) return NextResponse.json({ round: null });

    const state = round.gameState as unknown as RouletteState;
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
