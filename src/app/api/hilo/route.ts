export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hiloTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/hilo?slug=classic
 * Returns a hilo table config.
 */
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const [table] = await db.select().from(hiloTables).where(eq(hiloTables.slug, slug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    return NextResponse.json({ table: { ...table, betOptions: (table.betOptions as number[]) || [1, 5, 10, 25] } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/hilo
 * Create a new hilo table (admin).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, title, description, betOptions, recipientAddress, primaryColor, accentColor } = body;

    if (!slug || !title || !recipientAddress) {
      return NextResponse.json({ error: "slug, title, recipientAddress required" }, { status: 400 });
    }

    const [table] = await db.insert(hiloTables).values({
      slug,
      title,
      description: description || null,
      betOptions: betOptions || [1, 5, 10, 25],
      recipientAddress,
      primaryColor: primaryColor || "#7C3AED",
      accentColor: accentColor || "#8B5CF6",
    }).returning();

    return NextResponse.json({ table });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
