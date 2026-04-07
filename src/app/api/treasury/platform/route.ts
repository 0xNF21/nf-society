import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payouts, lootboxOpens, lootboxes, dailySessions } from "@/lib/db/schema";
import { sql, eq, gte, and } from "drizzle-orm";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Exclude test payouts from calculations
    const noTests = sql`${payouts.gameType} NOT LIKE '%test%' AND ${payouts.gameId} NOT LIKE '%test%'`;

    // Total payouts (redistributed to players, excluding tests)
    const [totalPayout] = await db.select({
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), noTests));

    // Monthly payouts
    const [monthlyPayout] = await db.select({
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), gte(payouts.createdAt, thisMonth), noTests));

    // Weekly payouts
    const [weeklyPayout] = await db.select({
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), gte(payouts.createdAt, thisWeek), noTests));

    // Payouts by game type (excluding tests)
    const payoutsByGame = await db.select({
      gameType: payouts.gameType,
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), noTests)).groupBy(payouts.gameType);

    // Total bets from multiplayer games
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

    // Lootbox revenue — sum of pricePerOpenCrc for each open
    try {
      const lootboxOpensList = await db.select({
        lootboxId: lootboxOpens.lootboxId,
      }).from(lootboxOpens);

      const lootboxPrices = await db.select({
        id: lootboxes.id,
        price: lootboxes.pricePerOpenCrc,
      }).from(lootboxes);
      const priceMap = new Map(lootboxPrices.map(l => [l.id, l.price]));

      for (const open of lootboxOpensList) {
        totalBets += priceMap.get(open.lootboxId) || 0;
      }

      // Monthly lootbox
      const monthlyLootbox = await db.select({
        lootboxId: lootboxOpens.lootboxId,
      }).from(lootboxOpens).where(gte(lootboxOpens.openedAt, thisMonth));

      for (const open of monthlyLootbox) {
        monthlyBets += priceMap.get(open.lootboxId) || 0;
      }
    } catch {}

    // Daily revenue — 1 CRC per confirmed session
    try {
      const [dailyTotal] = await db.select({
        count: sql<number>`COUNT(*)`,
      }).from(dailySessions).where(sql`${dailySessions.address} IS NOT NULL`);

      totalBets += Number(dailyTotal.count); // 1 CRC each

      const [dailyMonthly] = await db.select({
        count: sql<number>`COUNT(*)`,
      }).from(dailySessions).where(and(
        sql`${dailySessions.address} IS NOT NULL`,
        gte(dailySessions.createdAt, thisMonth),
      ));

      monthlyBets += Number(dailyMonthly.count);
    } catch {}

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
