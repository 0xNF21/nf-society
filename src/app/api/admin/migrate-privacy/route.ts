export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const expected = process.env.MIGRATION_SECRET || process.env.ADMIN_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS privacy_settings (
        address TEXT PRIMARY KEY,
        hide_pnl BOOLEAN NOT NULL DEFAULT false,
        hide_total_bet BOOLEAN NOT NULL DEFAULT false,
        hide_xp_spent BOOLEAN NOT NULL DEFAULT false,
        hide_game_history BOOLEAN NOT NULL DEFAULT false,
        hide_from_leaderboard BOOLEAN NOT NULL DEFAULT false,
        hide_from_search BOOLEAN NOT NULL DEFAULT false,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);

    const check = await db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'privacy_settings' ORDER BY ordinal_position;
    `);

    return NextResponse.json({
      ok: true,
      table: "privacy_settings",
      columns: (check as { rows?: unknown[] }).rows ?? check,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[migrate-privacy]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
