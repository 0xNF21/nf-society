export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { diceTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/dice?slug=classic
 * Returns a dice table config.
 */
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const [table] = await db.select().from(diceTables).where(eq(diceTables.slug, slug)).limit(1);
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
 * POST /api/dice
 * Create a new dice table (admin).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, title, description, betOptions, recipientAddress, primaryColor, accentColor } = body;

    if (!slug || !title || !recipientAddress) {
      return NextResponse.json({ error: "slug, title, recipientAddress required" }, { status: 400 });
    }

    const [table] = await db.insert(diceTables).values({
      slug,
      title,
      description: description || null,
      betOptions: betOptions || [1, 5, 10, 25],
      recipientAddress,
      primaryColor: primaryColor || "#F59E0B",
      accentColor: accentColor || "#D97706",
    }).returning();

    return NextResponse.json({ table });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
