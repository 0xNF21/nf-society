import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { memoryGames } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateGameCode } from "@/lib/utils";

function generateGridSeed(): string {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

const VALID_DIFFICULTIES = ["easy", "medium", "hard"];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { betCrc, difficulty = "medium", recipientAddress } = body;

    if (!betCrc || typeof betCrc !== "number" || betCrc <= 0) {
      return NextResponse.json({ error: "betCrc must be a positive number" }, { status: 400 });
    }

    if (!VALID_DIFFICULTIES.includes(difficulty)) {
      return NextResponse.json({ error: "difficulty must be easy, medium, or hard" }, { status: 400 });
    }

    const recipient = recipientAddress || process.env.SAFE_ADDRESS;
    if (!recipient) {
      return NextResponse.json({ error: "No recipient address configured" }, { status: 500 });
    }

    let slug = generateGameCode();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db.select().from(memoryGames)
        .where(eq(memoryGames.slug, slug)).limit(1);
      if (existing.length === 0) break;
      slug = generateGameCode();
      attempts++;
    }

    const [game] = await db.insert(memoryGames).values({
      slug,
      betCrc,
      difficulty,
      recipientAddress: recipient,
      commissionPct: 5,
      gridSeed: generateGridSeed(),
    }).returning();

    return NextResponse.json(game, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create game" }, { status: 500 });
  }
}
