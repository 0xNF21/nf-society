export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lootboxOpens, claimedPayments } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const lootboxId = req.nextUrl.searchParams.get("lootboxId");
    if (!lootboxId) {
      return NextResponse.json({ error: "lootboxId required" }, { status: 400 });
    }

    const token = req.nextUrl.searchParams.get("token");
    const lootboxIdNum = parseInt(lootboxId);

    // If token provided, filter to only this player's opens
    const whereClause = token
      ? and(eq(lootboxOpens.lootboxId, lootboxIdNum), eq(lootboxOpens.playerToken, token))
      : eq(lootboxOpens.lootboxId, lootboxIdNum);

    const [opens, claimed] = await Promise.all([
      db.select().from(lootboxOpens)
        .where(whereClause)
        .orderBy(desc(lootboxOpens.openedAt))
        .limit(20),
      db.select({ txHash: claimedPayments.txHash }).from(claimedPayments)
        .where(eq(claimedPayments.gameType, "lootbox")),
    ]);

    const claimedTxHashes = claimed.map(c => c.txHash);

    return NextResponse.json({ opens, claimedTxHashes });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
