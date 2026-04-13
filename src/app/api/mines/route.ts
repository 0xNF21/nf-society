export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { minesTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/mines?slug=classic
 * Returns a mines table config.
 */
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const [table] = await db.select().from(minesTables).where(eq(minesTables.slug, slug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    return NextResponse.json({
      table: {
        ...table,
        betOptions: (table.betOptions as number[]) || [1, 5, 10, 25],
        mineOptions: (table.mineOptions as number[]) || [1, 3, 5, 10, 24],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/mines
 * Create a new mines table (admin).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, title, description, betOptions, mineOptions, recipientAddress, primaryColor, accentColor } = body;

    if (!slug || !title || !recipientAddress) {
      return NextResponse.json({ error: "slug, title, recipientAddress required" }, { status: 400 });
    }

    const [table] = await db.insert(minesTables).values({
      slug,
      title,
      description: description || null,
      betOptions: betOptions || [1, 5, 10, 25],
      mineOptions: mineOptions || [1, 3, 5, 10, 24],
      recipientAddress,
      primaryColor: primaryColor || "#DC2626",
      accentColor: accentColor || "#EF4444",
    }).returning();

    return NextResponse.json({ table });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
