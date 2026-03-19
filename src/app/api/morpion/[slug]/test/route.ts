import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { morpionGames } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Test mode only available in development" }, { status: 403 });
  }

  const { slug } = await params;
  const [game] = await db.select().from(morpionGames).where(eq(morpionGames.slug, slug)).limit(1);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  await db.update(morpionGames).set({
    player1Address: "0xTEST000000000000000000000000000000000001",
    player2Address: "0xTEST000000000000000000000000000000000002",
    player1TxHash: "0xfaketxhash1",
    player2TxHash: "0xfaketxhash2",
    status: "active",
    updatedAt: new Date(),
  }).where(eq(morpionGames.slug, slug));

  return NextResponse.json({ ok: true, player1: "0xTEST...0001", player2: "0xTEST...0002" });
}
