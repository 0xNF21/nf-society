import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pfcGames } from "@/lib/db/schema/pfc";
import { eq } from "drizzle-orm";
import { createInitialState } from "@/lib/pfc";

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Dev only" }, { status: 403 });
  }

  const [game] = await db.select().from(pfcGames).where(eq(pfcGames.slug, params.slug));
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.update(pfcGames).set({
    player1Address: "0xTEST000000000000000000000000000000000001",
    player2Address: "0xTEST000000000000000000000000000000000002",
    player1TxHash: "0xtest1",
    player2TxHash: "0xtest2",
    player1Token: "test-p1",
    player2Token: "test-p2",
    status: "playing",
    gameState: createInitialState(game.bestOf as 3 | 5),
    updatedAt: new Date(),
  }).where(eq(pfcGames.id, game.id));

  return NextResponse.json({ ok: true });
}
