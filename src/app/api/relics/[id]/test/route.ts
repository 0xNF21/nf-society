import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { relicsGames } from "@/lib/db/schema/relics";
import { eq } from "drizzle-orm";
import { RELIC_ORDER, RELICS, GRID_SIZE, canPlace, placeRelic, emptyGrid } from "@/lib/relics";
import type { PlayerGrid, Orientation } from "@/lib/relics";

function generateRandomGrid(): PlayerGrid {
  let grid = emptyGrid();
  for (const rid of RELIC_ORDER) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const o: Orientation = Math.random() > 0.5 ? "H" : "V";
      const r = Math.floor(Math.random() * GRID_SIZE);
      const c = Math.floor(Math.random() * GRID_SIZE);
      if (canPlace(grid, rid, r, c, o)) {
        grid = placeRelic(grid, rid, r, c, o);
        break;
      }
    }
  }
  return grid;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Test mode only available in development" }, { status: 403 });
  }

  const { id } = await params;
  const [game] = await db.select().from(relicsGames).where(eq(relicsGames.slug, id)).limit(1);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const mode = req.nextUrl.searchParams.get("mode") || "inject";

  if (mode === "skip") {
    // Inject players + auto-place relics + start game
    const grid1 = generateRandomGrid();
    const grid2 = generateRandomGrid();
    await db.update(relicsGames).set({
      player1Address: game.player1Address || "0xtest000000000000000000000000000000000001",
      player2Address: game.player2Address || "0xtest000000000000000000000000000000000002",
      player1TxHash: game.player1TxHash || "0xfaketxhash1",
      player2TxHash: game.player2TxHash || "0xfaketxhash2",
      grid1,
      grid2,
      ready1: 1,
      ready2: 1,
      status: "playing",
      currentTurn: game.player1Address || "0xtest000000000000000000000000000000000001",
      updatedAt: new Date(),
    }).where(eq(relicsGames.slug, id));
    return NextResponse.json({ ok: true, mode: "skip", status: "playing" });
  }

  // Default: inject players only → placing phase
  await db.update(relicsGames).set({
    player1Address: "0xtest000000000000000000000000000000000001",
    player2Address: "0xtest000000000000000000000000000000000002",
    player1TxHash: "0xfaketxhash1",
    player2TxHash: "0xfaketxhash2",
    status: "placing",
    updatedAt: new Date(),
  }).where(eq(relicsGames.slug, id));

  return NextResponse.json({ ok: true, mode: "inject", status: "placing" });
}
