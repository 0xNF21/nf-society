import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payouts, claimedPayments, lootboxOpens, dailySessions, jackpotPool, morpionGames, memoryGames, relicsGames, damesGames, pfcGames, playerBadges, players, shopPurchases, shopCoupons } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

function checkAuth(req: NextRequest) {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD;
}

const RESET_TARGETS: Record<string, { label: string; tables: string[]; where?: string }> = {
  // Payouts
  payouts_all: { label: "Tous les payouts", tables: ["payouts"] },
  payouts_lootbox: { label: "Payouts lootbox seulement", tables: ["payouts"], where: "game_type = 'lootbox'" },
  payouts_games: { label: "Payouts jeux multi seulement", tables: ["payouts"], where: "game_type IN ('morpion','memory','relics','dames','pfc')" },
  payouts_daily: { label: "Payouts daily seulement", tables: ["payouts"], where: "game_type LIKE 'daily-%'" },
  payouts_shop: { label: "Payouts shop seulement", tables: ["payouts"], where: "game_type LIKE 'shop%'" },
  payouts_tests: { label: "Payouts tests seulement", tables: ["payouts"], where: "game_type LIKE '%test%' OR game_id LIKE '%test%'" },
  // Lootbox
  lootbox_opens: { label: "Lootbox Opens", tables: ["lootbox_opens"] },
  // Claimed
  claimed_payments: { label: "Claimed Payments", tables: ["claimed_payments"] },
  // Daily
  daily_sessions: { label: "Daily Sessions + Jackpot", tables: ["daily_sessions", "jackpot_pool"] },
  // Games
  games_all: { label: "Toutes les parties (tous les jeux)", tables: ["morpion_moves", "morpion_games", "memory_games", "relics_games", "dames_games", "pfc_games"] },
  games_morpion: { label: "Parties morpion", tables: ["morpion_moves", "morpion_games"] },
  games_memory: { label: "Parties memory", tables: ["memory_games"] },
  games_relics: { label: "Parties relics", tables: ["relics_games"] },
  games_dames: { label: "Parties dames", tables: ["dames_games"] },
  games_pfc: { label: "Parties PFC", tables: ["pfc_games"] },
  // Players
  player_badges: { label: "Badges joueurs (pas les definitions)", tables: ["player_badges"] },
  player_stats: { label: "Stats joueurs (XP, level, streak)", tables: ["players"] },
  // Shop
  shop_history: { label: "Historique achats shop", tables: ["shop_purchases", "shop_coupons"] },
};

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    targets: Object.entries(RESET_TARGETS).map(([key, val]) => ({
      key,
      label: val.label,
      tables: val.tables,
    })),
  });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { target, confirm } = await req.json();

    if (!target || !RESET_TARGETS[target]) {
      return NextResponse.json({ error: "Invalid target" }, { status: 400 });
    }

    if (confirm !== "confirmer") {
      return NextResponse.json({ error: "Tapez 'confirmer' pour valider" }, { status: 400 });
    }

    const tables = RESET_TARGETS[target].tables;
    const results: string[] = [];
    const backup: Record<string, unknown[]> = {};

    // Backup data before deletion
    for (const table of tables) {
      try {
        const rows = await db.execute(sql.raw(`SELECT * FROM ${table}`));
        backup[table] = rows.rows as unknown[];
        results.push(`${table}: ${backup[table].length} rows backed up`);
      } catch {}
    }

    // Store backup in a separate table
    try {
      await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS admin_backups (
        id SERIAL PRIMARY KEY,
        target TEXT NOT NULL,
        data JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )`));
      await db.execute(sql`INSERT INTO admin_backups (target, data) VALUES (${target}, ${JSON.stringify(backup)})`);
      results.push("backup: saved");
    } catch (e: unknown) {
      results.push("backup: " + (e instanceof Error ? e.message : "error"));
    }

    // Delete data
    const whereClause = RESET_TARGETS[target].where;
    for (const table of tables) {
      try {
        const query = whereClause
          ? `DELETE FROM ${table} WHERE ${whereClause}`
          : `DELETE FROM ${table}`;
        await db.execute(sql.raw(query));
        results.push(`${table}: cleared${whereClause ? ` (${whereClause})` : ""}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "error";
        results.push(`${table}: ${msg}`);
      }
    }

    return NextResponse.json({ ok: true, target, results });
  } catch (error) {
    console.error("[Admin Reset] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
