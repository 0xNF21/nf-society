import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY migration route — drops and recreates the crc_races_games table.
 * Delete once the table schema is stable on both local and Neon databases.
 */
export async function POST() {
  try {
    await db.execute(sql`DROP TABLE IF EXISTS crc_races_games`);
    await db.execute(sql`
      CREATE TABLE crc_races_games (
        id SERIAL PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        tier TEXT NOT NULL,
        bet_crc INTEGER NOT NULL,
        max_players INTEGER NOT NULL,
        commission_pct INTEGER NOT NULL DEFAULT 5,
        recipient_address TEXT NOT NULL,
        is_private BOOLEAN NOT NULL DEFAULT false,
        players JSONB NOT NULL DEFAULT '[]'::jsonb,
        status TEXT NOT NULL DEFAULT 'waiting',
        game_state JSONB,
        winner_address TEXT,
        payouts JSONB NOT NULL DEFAULT '[]'::jsonb,
        payout_status TEXT NOT NULL DEFAULT 'pending',
        rematch_slug TEXT,
        started_at TIMESTAMP,
        finished_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    return NextResponse.json({ ok: true, message: "crc_races_games table recreated" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Migration failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
