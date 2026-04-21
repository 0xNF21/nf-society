/**
 * POST /api/rematch
 * Body: { gameKey, slug }
 * Creates a new game with same settings, then patches the old game with rematch_slug.
 */
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { getServerGameConfig } from "@/lib/game-registry-server";
import { createMultiplayerGame } from "@/lib/multiplayer";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "rematch", 5, 60000);
  if (limited) return limited;

  try {
    const { gameKey, slug } = await req.json();

    if (!gameKey || !slug) {
      return NextResponse.json({ error: "gameKey and slug required" }, { status: 400 });
    }

    const config = getServerGameConfig(gameKey);

    // Get the original game
    const [original] = await db.select()
      .from(config.table)
      .where(eq(config.table.slug, slug))
      .limit(1);

    if (!original) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (original.status !== "finished") {
      return NextResponse.json({ error: "Game not finished" }, { status: 400 });
    }

    if (original.rematchSlug) {
      return NextResponse.json({ error: "Rematch already created", rematchSlug: original.rematchSlug }, { status: 409 });
    }

    // Build create body with same settings
    const createBody: Record<string, unknown> = {
      betCrc: original.betCrc,
      isPrivate: original.isPrivate ?? false,
    };

    // Game-specific fields
    if (gameKey === "memory" && original.difficulty) {
      createBody.difficulty = original.difficulty;
    }
    if (gameKey === "pfc" && original.bestOf) {
      createBody.bestOf = original.bestOf;
    }

    // Create the new game
    const { slug: newSlug } = await createMultiplayerGame(gameKey, createBody as { betCrc: number; isPrivate?: boolean });

    // Patch the original game with rematch slug
    await db.update(config.table)
      .set({ rematchSlug: newSlug })
      .where(eq(config.table.slug, slug));

    return NextResponse.json({ rematchSlug: newSlug }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create rematch";
    console.error("[Rematch] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
