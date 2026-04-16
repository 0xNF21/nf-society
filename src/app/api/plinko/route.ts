export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plinkoTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/plinko?slug=classic
 * Returns a plinko table config.
 */
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const [table] = await db.select().from(plinkoTables).where(eq(plinkoTables.slug, slug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    return NextResponse.json({
      table: {
        ...table,
        betOptions: (table.betOptions as number[]) || [1, 5, 10, 25],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/plinko
 * Create a new plinko table (admin).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, title, description, betOptions, recipientAddress, primaryColor, accentColor } = body;

    if (!slug || !title || !recipientAddress) {
      return NextResponse.json({ error: "slug, title, recipientAddress required" }, { status: 400 });
    }

    const [table] = await db.insert(plinkoTables).values({
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
