import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payouts } from "@/lib/db/schema";
import { sql, eq, gte, and } from "drizzle-orm";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Total payouts (redistributed to players)
    const [totalPayout] = await db.select({
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(payouts).where(eq(payouts.status, "success"));

    // Monthly payouts
    const [monthlyPayout] = await db.select({
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), gte(payouts.createdAt, thisMonth)));

    // Weekly payouts
    const [weeklyPayout] = await db.select({
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), gte(payouts.createdAt, thisWeek)));

    // Payouts by game type
    const payoutsByGame = await db.select({
      gameType: payouts.gameType,
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(payouts).where(eq(payouts.status, "success")).groupBy(payouts.gameType);

    // Total bets (revenue) — sum of all bets from finished games
    let totalBets = 0;
    let totalGamesPlayed = 0;
    let monthlyBets = 0;

    for (const config of ALL_SERVER_GAMES) {
      try {
        const [allTime] = await db.select({
          total: sql<number>`COALESCE(SUM(${config.table.betCrc} * 2), 0)`,
          count: sql<number>`COUNT(*)`,
        }).from(config.table).where(eq(config.table.status, "finished"));

        totalBets += Number(allTime.total);
        totalGamesPlayed += Number(allTime.count);

        const [monthly] = await db.select({
          total: sql<number>`COALESCE(SUM(${config.table.betCrc} * 2), 0)`,
        }).from(config.table).where(and(eq(config.table.status, "finished"), gte(config.table.updatedAt, thisMonth)));

        monthlyBets += Number(monthly.total);
      } catch {}
    }

    const totalRedistributed = Number(totalPayout.total);
    const totalCommissions = totalBets - totalRedistributed;

    return NextResponse.json({
      totalBets: Math.round(totalBets * 10) / 10,
      totalRedistributed: Math.round(totalRedistributed * 10) / 10,
      totalCommissions: Math.round(totalCommissions * 10) / 10,
      totalGamesPlayed,
      totalPayouts: Number(totalPayout.count),
      monthlyBets: Math.round(monthlyBets * 10) / 10,
      monthlyRedistributed: Math.round(Number(monthlyPayout.total) * 10) / 10,
      weeklyRedistributed: Math.round(Number(weeklyPayout.total) * 10) / 10,
      byGameType: payoutsByGame.map(p => ({
        gameType: p.gameType,
        total: Math.round(Number(p.total) * 10) / 10,
        count: Number(p.count),
      })),
    });
  } catch (error) {
    console.error("[Treasury Platform] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
