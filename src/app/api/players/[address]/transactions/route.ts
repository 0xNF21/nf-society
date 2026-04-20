import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payouts, dailySessions } from "@/lib/db/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";
import { GAME_LABELS } from "@/lib/game-registry";
import { ALL_CHANCE_SERVER_GAMES } from "@/lib/chance-registry-server";

export const dynamic = "force-dynamic";

type Transaction = {
  type: "in" | "out";
  amount: number;
  label: string;
  category: string;
  date: string;
};

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    const addr = params.address.toLowerCase();
    const transactions: Transaction[] = [];

    // 1. Payouts received (CRC in)
    const playerPayouts = await db.select({
      amountCrc: payouts.amountCrc,
      gameType: payouts.gameType,
      reason: payouts.reason,
      createdAt: payouts.createdAt,
    }).from(payouts).where(
      and(eq(payouts.recipientAddress, addr), eq(payouts.status, "success"))
    ).orderBy(desc(payouts.createdAt));

    for (const p of playerPayouts) {
      transactions.push({
        type: "in",
        amount: Number(p.amountCrc),
        label: p.reason || `${p.gameType} payout`,
        category: p.gameType,
        date: p.createdAt.toISOString(),
      });
    }

    // 2. Game bets (CRC out) — from each game table
    for (const config of ALL_SERVER_GAMES) {
      try {
        const games = await db.select({
          slug: config.table.slug,
          betCrc: config.table.betCrc,
          updatedAt: config.table.updatedAt,
          player1Address: config.table.player1Address,
          player2Address: config.table.player2Address,
          status: config.table.status,
        }).from(config.table).where(
          sql`(${config.table.player1Address} = ${addr} OR ${config.table.player2Address} = ${addr}) AND ${config.table.status} != 'waiting_p1'`
        ).orderBy(desc(config.table.updatedAt));

        for (const g of games) {
          transactions.push({
            type: "out",
            amount: g.betCrc,
            label: `${GAME_LABELS[config.key] || config.key} ${g.slug} — mise`,
            category: config.key,
            date: g.updatedAt.toISOString(),
          });
        }
      } catch {}
    }

    // 3. Chance game bets (CRC out) — blackjack, hilo, mines, dice, coin_flip,
    //    roulette, keno, plinko, crash_dash, lootboxes.
    //    Rounds abandonnees (status="playing") sont exclues via le registre.
    for (const cfg of ALL_CHANCE_SERVER_GAMES) {
      try {
        const rounds = await cfg.getPlayerRounds(addr);
        for (const r of rounds) {
          if (r.betCrc <= 0) continue;
          transactions.push({
            type: "out",
            amount: r.betCrc,
            label: `${cfg.label} — mise`,
            category: cfg.key,
            date: r.createdAt.toISOString(),
          });
        }
      } catch {}
    }

    // 4. Daily sessions (CRC out — 1 CRC each)
    try {
      const sessions = await db.select({
        date: dailySessions.date,
        createdAt: dailySessions.createdAt,
      }).from(dailySessions).where(
        and(eq(dailySessions.address, addr), sql`${dailySessions.txHash} IS NOT NULL`)
      ).orderBy(desc(dailySessions.createdAt));

      for (const s of sessions) {
        transactions.push({
          type: "out",
          amount: 1,
          label: `Daily — ticket ${s.date}`,
          category: "daily",
          date: s.createdAt.toISOString(),
        });
      }
    } catch {}

    // Sort by date desc
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ transactions: transactions.slice(0, 100) });
  } catch (error) {
    console.error("[Transactions] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
