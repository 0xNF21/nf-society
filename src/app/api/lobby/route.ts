import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { morpionGames, memoryGames } from "@/lib/db/schema";
import { relicsGames } from "@/lib/db/schema/relics";
import { damesGames } from "@/lib/db/schema/dames";
import { eq, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fetch all public games waiting for player 2
    const [morpion, dames, relics, memory] = await Promise.all([
      db.select({
        slug: morpionGames.slug,
        betCrc: morpionGames.betCrc,
        commissionPct: morpionGames.commissionPct,
        createdAt: morpionGames.createdAt,
      })
        .from(morpionGames)
        .where(and(eq(morpionGames.status, "waiting_p2"), eq(morpionGames.isPrivate, false)))
        .orderBy(desc(morpionGames.createdAt))
        .limit(20),

      db.select({
        slug: damesGames.slug,
        betCrc: damesGames.betCrc,
        commissionPct: damesGames.commissionPct,
        createdAt: damesGames.createdAt,
      })
        .from(damesGames)
        .where(and(eq(damesGames.status, "waiting_p2"), eq(damesGames.isPrivate, false)))
        .orderBy(desc(damesGames.createdAt))
        .limit(20),

      db.select({
        slug: relicsGames.slug,
        betCrc: relicsGames.betCrc,
        commissionPct: relicsGames.commissionPct,
        createdAt: relicsGames.createdAt,
      })
        .from(relicsGames)
        .where(and(eq(relicsGames.status, "waiting_p2"), eq(relicsGames.isPrivate, false)))
        .orderBy(desc(relicsGames.createdAt))
        .limit(20),

      db.select({
        slug: memoryGames.slug,
        betCrc: memoryGames.betCrc,
        commissionPct: memoryGames.commissionPct,
        createdAt: memoryGames.createdAt,
      })
        .from(memoryGames)
        .where(and(eq(memoryGames.status, "waiting_p2"), eq(memoryGames.isPrivate, false)))
        .orderBy(desc(memoryGames.createdAt))
        .limit(20),
    ]);

    return NextResponse.json({
      rooms: [
        ...morpion.map((g) => ({ ...g, game: "morpion" as const })),
        ...dames.map((g) => ({ ...g, game: "dames" as const })),
        ...relics.map((g) => ({ ...g, game: "relics" as const })),
        ...memory.map((g) => ({ ...g, game: "memory" as const })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    });
  } catch (error) {
    console.error("[Lobby] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
