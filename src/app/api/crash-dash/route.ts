export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crashDashTables } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/crash-dash?slug=classic
 * Returns a crash-dash table config.
 */
export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const [table] = await db.select().from(crashDashTables).where(eq(crashDashTables.slug, slug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    return NextResponse.json({
      table: {
        ...table,
        betOptions: (table.betOptions as number[]) || [5, 10, 50, 100],
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/crash-dash
 * Create a new crash-dash table (admin).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, title, description, betOptions, recipientAddress, primaryColor, accentColor } = body;

    if (!slug || !title || !recipientAddress) {
      return NextResponse.json({ error: "slug, title, recipientAddress required" }, { status: 400 });
    }

    const [table] = await db.insert(crashDashTables).values({
      slug,
      title,
      description: description || null,
      betOptions: betOptions || [5, 10, 50, 100],
      recipientAddress,
      primaryColor: primaryColor || "#16A34A",
      accentColor: accentColor || "#22C55E",
    }).returning();

    return NextResponse.json({ table });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
