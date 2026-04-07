import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { damesGames } from "@/lib/db/schema/dames";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const [game] = await db.select().from(damesGames).where(eq(damesGames.slug, params.id));
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(game);
}
