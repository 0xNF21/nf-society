export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lootboxOpens, claimedPayments } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const lootboxId = req.nextUrl.searchParams.get("lootboxId");
    if (!lootboxId) {
      return NextResponse.json({ error: "lootboxId required" }, { status: 400 });
    }

    const [opens, claimed] = await Promise.all([
      db.select().from(lootboxOpens)
        .where(eq(lootboxOpens.lootboxId, parseInt(lootboxId)))
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
