export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blackjackHands } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getVisibleState } from "@/lib/blackjack";
import type { BlackjackState } from "@/lib/blackjack";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const handId = parseInt(id, 10);
    if (isNaN(handId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const [hand] = await db.select().from(blackjackHands).where(eq(blackjackHands.id, handId)).limit(1);
    if (!hand) return NextResponse.json({ error: "Hand not found" }, { status: 404 });

    const state = hand.gameState as unknown as BlackjackState;
    const visible = getVisibleState(state);

    return NextResponse.json({
      id: hand.id,
      tableId: hand.tableId,
      playerAddress: hand.playerAddress,
      betCrc: hand.betCrc,
      outcome: hand.outcome,
      payoutCrc: hand.payoutCrc,
      payoutStatus: hand.payoutStatus,
      createdAt: hand.createdAt,
      ...visible,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
