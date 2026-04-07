import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payouts, claimedPayments, lootboxOpens, dailySessions, jackpotPool, morpionGames, memoryGames, relicsGames, damesGames, pfcGames, playerBadges, players, shopPurchases, shopCoupons } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

function checkAuth(req: NextRequest) {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD;
}

const RESET_TARGETS: Record<string, { label: string; tables: string[] }> = {
  payouts: { label: "Payouts", tables: ["payouts"] },
  lootbox_opens: { label: "Lootbox Opens", tables: ["lootbox_opens"] },
  claimed_payments: { label: "Claimed Payments", tables: ["claimed_payments"] },
  daily_sessions: { label: "Daily Sessions + Jackpot", tables: ["daily_sessions", "jackpot_pool"] },
  games: { label: "Toutes les parties (morpion, memory, relics, dames, pfc)", tables: ["morpion_moves", "morpion_games", "memory_games", "relics_games", "dames_games", "pfc_games"] },
  player_badges: { label: "Badges joueurs (pas les definitions)", tables: ["player_badges"] },
  player_stats: { label: "Stats joueurs (XP, level, streak)", tables: ["players"] },
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

    if (confirm !== `RESET_${target.toUpperCase()}`) {
      return NextResponse.json({ error: `Confirmation required: RESET_${target.toUpperCase()}` }, { status: 400 });
    }

    const tables = RESET_TARGETS[target].tables;
    const results: string[] = [];

    for (const table of tables) {
      try {
        await db.execute(sql.raw(`DELETE FROM ${table}`));
        results.push(`${table}: cleared`);
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
