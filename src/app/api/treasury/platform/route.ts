import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payouts, lootboxOpens, lootboxes, dailySessions } from "@/lib/db/schema";
import { sql, eq, gte, and, lt } from "drizzle-orm";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";
import { getSafeCrcBalance } from "@/lib/payout";

export const dynamic = "force-dynamic";

function round(n: number) { return Math.round(n * 10) / 10; }

export async function GET() {
  try {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const noTests = sql`${payouts.gameType} NOT LIKE '%test%' AND ${payouts.gameId} NOT LIKE '%test%'`;

    // ─── PAYOUTS ───
    const [totalPayout] = await db.select({
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), noTests));

    const [monthlyPayout] = await db.select({
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), gte(payouts.createdAt, thisMonth), noTests));

    const [lastMonthPayout] = await db.select({
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), gte(payouts.createdAt, lastMonth), lt(payouts.createdAt, thisMonth), noTests));

    const payoutsByGame = await db.select({
      gameType: payouts.gameType,
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
      count: sql<number>`COUNT(*)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), noTests)).groupBy(payouts.gameType);

    // Weekly payouts by day (for chart)
    const weeklyByDay = await db.select({
      day: sql<string>`TO_CHAR(${payouts.createdAt}, 'YYYY-MM-DD')`,
      total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
    }).from(payouts).where(and(eq(payouts.status, "success"), gte(payouts.createdAt, thisWeek), noTests))
      .groupBy(sql`TO_CHAR(${payouts.createdAt}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${payouts.createdAt}, 'YYYY-MM-DD')`);

    // ─── GAME BETS (per game for recap) ───
    let totalBets = 0;
    let totalGamesPlayed = 0;
    let monthlyBets = 0;
    let lastMonthBets = 0;
    const gameRecaps: Array<{ key: string; played: number; totalBet: number; totalPaid: number; margin: number }> = [];

    for (const config of ALL_SERVER_GAMES) {
      try {
        const [allTime] = await db.select({
          total: sql<number>`COALESCE(SUM(${config.table.betCrc} * 2), 0)`,
          count: sql<number>`COUNT(*)`,
        }).from(config.table).where(eq(config.table.status, "finished"));

        const bet = Number(allTime.total);
        const count = Number(allTime.count);
        totalBets += bet;
        totalGamesPlayed += count;

        // Find payouts for this game
        const gamePayout = payoutsByGame.find(p => p.gameType === config.key);
        const paid = gamePayout ? Number(gamePayout.total) : 0;

        gameRecaps.push({
          key: config.key,
          played: count,
          totalBet: round(bet),
          totalPaid: round(paid),
          margin: round(bet - paid),
        });

        const [monthly] = await db.select({
          total: sql<number>`COALESCE(SUM(${config.table.betCrc} * 2), 0)`,
        }).from(config.table).where(and(eq(config.table.status, "finished"), gte(config.table.updatedAt, thisMonth)));
        monthlyBets += Number(monthly.total);

        const [lastM] = await db.select({
          total: sql<number>`COALESCE(SUM(${config.table.betCrc} * 2), 0)`,
        }).from(config.table).where(and(eq(config.table.status, "finished"), gte(config.table.updatedAt, lastMonth), lt(config.table.updatedAt, thisMonth)));
        lastMonthBets += Number(lastM.total);
      } catch {}
    }

    // ─── LOOTBOX ───
    let lootboxReceived = 0;
    let lootboxMonthly = 0;
    let lootboxOpensCount = 0;
    let lootboxRewardTotal = 0;

    try {
      const opensList = await db.select({
        lootboxId: lootboxOpens.lootboxId,
        rewardCrc: lootboxOpens.rewardCrc,
      }).from(lootboxOpens);

      const prices = await db.select({ id: lootboxes.id, price: lootboxes.pricePerOpenCrc }).from(lootboxes);
      const priceMap = new Map(prices.map(l => [l.id, l.price]));

      lootboxOpensCount = opensList.length;
      for (const o of opensList) {
        lootboxReceived += priceMap.get(o.lootboxId) || 0;
        lootboxRewardTotal += Number(o.rewardCrc);
      }
      totalBets += lootboxReceived;

      const monthlyOpens = await db.select({ lootboxId: lootboxOpens.lootboxId })
        .from(lootboxOpens).where(gte(lootboxOpens.openedAt, thisMonth));
      for (const o of monthlyOpens) lootboxMonthly += priceMap.get(o.lootboxId) || 0;
      monthlyBets += lootboxMonthly;

      const lastMOpens = await db.select({ lootboxId: lootboxOpens.lootboxId })
        .from(lootboxOpens).where(and(gte(lootboxOpens.openedAt, lastMonth), lt(lootboxOpens.openedAt, thisMonth)));
      for (const o of lastMOpens) lastMonthBets += priceMap.get(o.lootboxId) || 0;
    } catch {}

    const lootboxPaid = payoutsByGame.find(p => p.gameType === "lootbox");
    const lootboxPaidTotal = lootboxPaid ? Number(lootboxPaid.total) : 0;

    // ─── DAILY ───
    let dailyReceived = 0;
    let dailyMonthly = 0;

    try {
      const [dTotal] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(dailySessions).where(sql`${dailySessions.address} IS NOT NULL`);
      dailyReceived = Number(dTotal.count);
      totalBets += dailyReceived;

      const [dMonthly] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(dailySessions).where(and(sql`${dailySessions.address} IS NOT NULL`, gte(dailySessions.createdAt, thisMonth)));
      dailyMonthly = Number(dMonthly.count);
      monthlyBets += dailyMonthly;

      const [dLastM] = await db.select({ count: sql<number>`COUNT(*)` })
        .from(dailySessions).where(and(sql`${dailySessions.address} IS NOT NULL`, gte(dailySessions.createdAt, lastMonth), lt(dailySessions.createdAt, thisMonth)));
      lastMonthBets += Number(dLastM.count);
    } catch {}

    const dailyPaidTypes = payoutsByGame.filter(p => p.gameType.startsWith("daily-"));
    const dailyPaidTotal = dailyPaidTypes.reduce((s, p) => s + Number(p.total), 0);

    // ─── SAFE BALANCE ───
    let safeBalance: number | null = null;
    try {
      const bal = await getSafeCrcBalance();
      const wei = BigInt("1000000000000000000");
      safeBalance = Number((bal.erc1155 + bal.erc20) / wei);
    } catch {}

    // ─── CALCULATIONS ───
    const totalRedistributed = Number(totalPayout.total);
    const totalCommissions = totalBets - totalRedistributed;
    const monthlyCommissions = monthlyBets - Number(monthlyPayout.total);
    const lastMonthCommissions = lastMonthBets - Number(lastMonthPayout.total);

    // Days since first payout
    const firstPayout = await db.select({ min: sql<string>`MIN(${payouts.createdAt})` }).from(payouts);
    const firstDate = firstPayout[0]?.min ? new Date(firstPayout[0].min) : now;
    const daysSinceStart = Math.max(1, Math.ceil((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
    const avgRevenuePerDay = totalCommissions / daysSinceStart;

    return NextResponse.json({
      safeBalance: safeBalance !== null ? round(safeBalance) : null,
      totalBets: round(totalBets),
      totalRedistributed: round(totalRedistributed),
      totalCommissions: round(totalCommissions),
      totalGamesPlayed,
      avgRevenuePerDay: round(avgRevenuePerDay),
      monthly: {
        bets: round(monthlyBets),
        redistributed: round(Number(monthlyPayout.total)),
        commissions: round(monthlyCommissions),
      },
      lastMonth: {
        bets: round(lastMonthBets),
        redistributed: round(Number(lastMonthPayout.total)),
        commissions: round(lastMonthCommissions),
      },
      lootbox: {
        opens: lootboxOpensCount,
        received: round(lootboxReceived),
        paid: round(lootboxPaidTotal),
        rtp: lootboxReceived > 0 ? round(lootboxPaidTotal / lootboxReceived * 100) : 0,
        margin: round(lootboxReceived - lootboxPaidTotal),
      },
      daily: {
        sessions: dailyReceived,
        received: round(dailyReceived),
        paid: round(dailyPaidTotal),
        rtp: dailyReceived > 0 ? round(dailyPaidTotal / dailyReceived * 100) : 0,
        margin: round(dailyReceived - dailyPaidTotal),
      },
      gameRecaps,
      weeklyChart: weeklyByDay.map(d => ({ day: d.day, paid: round(Number(d.total)) })),
    });
  } catch (error) {
    console.error("[Treasury Platform] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
