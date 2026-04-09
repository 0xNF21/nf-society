export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { draws } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const lotteryIdParam = req.nextUrl.searchParams.get("lotteryId");
    const lotteryId = lotteryIdParam ? parseInt(lotteryIdParam, 10) : null;

    if (!lotteryId) {
      return NextResponse.json({ draws: [] });
    }

    const allDraws = await db
      .select()
      .from(draws)
      .where(eq(draws.lotteryId, lotteryId))
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
