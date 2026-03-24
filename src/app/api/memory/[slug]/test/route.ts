import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { memoryGames } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Test mode only" }, { status: 403 });
  }

  const { slug } = await params;
  const [game] = await db.select().from(memoryGames).where(eq(memoryGames.slug, slug)).limit(1);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  await db.update(memoryGames).set({
    player1Address: "0xtest000000000000000000000000000000000001",
    player2Address: "0xtest000000000000000000000000000000000002",
    player1TxHash: "0xtest_tx_1",
    player2TxHash: "0xtest_tx_2",
    status: "playing",
    updatedAt: new Date(),
  }).where(eq(memoryGames.id, game.id));

  return NextResponse.json({ ok: true });
}
