import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { draws } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET() {
  try {
    const allDraws = await db
      .select()
      .from(draws)
      .orderBy(desc(draws.id));

    const history = allDraws.map((d) => ({
      id: d.id,
      winnerAddress: d.winnerAddress,
      blockNumber: d.blockNumber,
      blockHash: d.blockHash,
      participantCount: d.participantCount,
      selectionIndex: d.selectionIndex,
      drawnAt: d.drawnAt,
    }));

    return NextResponse.json({ draws: history });
  } catch (error: any) {
    console.error("Fetch draw history error:", error);
    return NextResponse.json({ draws: [] });
  }
}
