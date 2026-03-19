import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { morpionGames } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

function generateSlug(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let slug = "";
  for (let i = 0; i < 6; i++) slug += chars[Math.floor(Math.random() * chars.length)];
  return slug;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { betCrc, recipientAddress } = body;

    if (!betCrc || typeof betCrc !== "number" || betCrc <= 0) {
      return NextResponse.json({ error: "betCrc must be a positive number" }, { status: 400 });
    }

    const recipient = recipientAddress || process.env.SAFE_ADDRESS;
    if (!recipient) {
      return NextResponse.json({ error: "No recipient address configured" }, { status: 500 });
    }

    // Generate unique slug
    let slug = generateSlug();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await db.select().from(morpionGames)
        .where(eq(morpionGames.slug, slug)).limit(1);
      if (existing.length === 0) break;
      slug = generateSlug();
      attempts++;
    }

    const [game] = await db.insert(morpionGames).values({
      slug,
      betCrc,
      recipientAddress: recipient,
      commissionPct: 5,
    }).returning();

    return NextResponse.json(game, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create game" }, { status: 500 });
  }
}
