export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coinFlipTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/coin-flip?slug=classic
 * Returns a coin-flip table config.
 */
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const [table] = await db.select().from(coinFlipTables).where(eq(coinFlipTables.slug, slug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    return NextResponse.json({ table: { ...table, betOptions: (table.betOptions as number[]) || [1, 5, 10, 25] } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/coin-flip
 * Create a new coin-flip table (admin).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, title, description, betOptions, recipientAddress, primaryColor, accentColor } = body;

    if (!slug || !title || !recipientAddress) {
      return NextResponse.json({ error: "slug, title, recipientAddress required" }, { status: 400 });
    }

    const [table] = await db.insert(coinFlipTables).values({
      slug,
      title,
      description: description || null,
      betOptions: betOptions || [1, 5, 10, 25],
      recipientAddress,
      primaryColor: primaryColor || "#0EA5E9",
      accentColor: accentColor || "#0284C7",
    }).returning();

    return NextResponse.json({ table });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
