import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { relicsGames } from "@/lib/db/schema/relics";
import { eq } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const [game] = await db.select().from(relicsGames).where(eq(relicsGames.slug, params.id));
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(game);
}
