import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { payouts, lootboxOpens, lootboxes, dailySessions } from "@/lib/db/schema";
import { sql, eq, gte, and, lt } from "drizzle-orm";
import { aggregateAllChance, ALL_CHANCE_SERVER_GAMES } from "@/lib/chance-registry-server";
import { multiAggregate } from "@/lib/platform-stats";
import { getSafeCrcBalance } from "@/lib/payout";

export const dynamic = "force-dynamic";

function round(n: number) { return Math.round(n * 10) / 10; }

/**
 * Dashboard tresorerie plateforme. Utilise les MEMES helpers que /api/stats/platform
 * (multiAggregate + aggregateAllChance) pour garantir la coherence des chiffres.
 *
 *   totalBets        = mises multi+lottery (claimedPayments) + chance (bet_crc)
 *   totalRedistributed = payouts multi+lottery (table payouts) + chance (payout_crc)
 *   totalCommissions = totalBets - totalRedistributed
 *                    = commissions multi (5% du pot) + marge maison chance
 *
 * Daily sessions : non comptees dans les totaux (pas dans /stats) mais section dediee.
 */

export async function GET() {
  try {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // Exclut tests + cashouts pour les stats secondaires (weekly chart, section daily/lootbox)
    const noTests = sql`${payouts.gameType} NOT LIKE '%test%' AND ${payouts.gameId} NOT LIKE '%test%' AND ${payouts.gameType} != 'cashout'`;

    const [
      multiAll, multiMonth, multiWeek, multiToday, multiLM,
      chanceAll, chanceMonth, chanceWeek, chanceToday, chanceLMIncl,
      payoutsByGame, weeklyByDay, firstPayoutRow,
      dailySess, dailySessToday, dailySessWeek, dailySessMonth, dailySessLM,
      safeBalRaw,
    ] = await Promise.all([
      multiAggregate(),
      multiAggregate(thisMonth),
      multiAggregate(thisWeek),
      multiAggregate(today),
      multiAggregate(lastMonth, thisMonth),
      aggregateAllChance(),
      aggregateAllChance(thisMonth),
      aggregateAllChance(thisWeek),
      aggregateAllChance(today),
      aggregateAllChance(lastMonth),
      db.select({
        gameType: payouts.gameType,
        total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
        count: sql<number>`COUNT(*)`,
      }).from(payouts).where(and(eq(payouts.status, "success"), noTests)).groupBy(payouts.gameType),
      db.select({
        day: sql<string>`TO_CHAR(${payouts.createdAt}, 'YYYY-MM-DD')`,
        total: sql<number>`COALESCE(SUM(${payouts.amountCrc}), 0)`,
      }).from(payouts).where(and(eq(payouts.status, "success"), gte(payouts.createdAt, thisWeek), noTests))
        .groupBy(sql`TO_CHAR(${payouts.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${payouts.createdAt}, 'YYYY-MM-DD')`),
      db.select({ min: sql<string>`MIN(${payouts.createdAt})` }).from(payouts),
      db.select({ count: sql<number>`COUNT(*)` }).from(dailySessions).where(sql`${dailySessions.address} IS NOT NULL`),
      db.select({ count: sql<number>`COUNT(*)` }).from(dailySessions).where(and(sql`${dailySessions.address} IS NOT NULL`, gte(dailySessions.createdAt, today))),
      db.select({ count: sql<number>`COUNT(*)` }).from(dailySessions).where(and(sql`${dailySessions.address} IS NOT NULL`, gte(dailySessions.createdAt, thisWeek))),
      db.select({ count: sql<number>`COUNT(*)` }).from(dailySessions).where(and(sql`${dailySessions.address} IS NOT NULL`, gte(dailySessions.createdAt, thisMonth))),
      db.select({ count: sql<number>`COUNT(*)` }).from(dailySessions).where(and(sql`${dailySessions.address} IS NOT NULL`, gte(dailySessions.createdAt, lastMonth), lt(dailySessions.createdAt, thisMonth))),
      getSafeCrcBalance().catch(() => null),
    ]);

    // ─── TOTAUX (aligne sur /stats allTime : multi+lottery + chance) ───
    const totalBets = multiAll.total.wagered + chanceAll.wagered;
    const totalRedistributed = multiAll.total.paidOut + chanceAll.paidOut;
    const totalGamesPlayed = multiAll.total.rounds + chanceAll.rounds;
    const totalCommissions = totalBets - totalRedistributed;

    // Periodes (lastMonth = fenetre [lastMonth, thisMonth[)
    const monthlyBets = multiMonth.total.wagered + chanceMonth.wagered;
    const weeklyBets = multiWeek.total.wagered + chanceWeek.wagered;
    const dailyBets = multiToday.total.wagered + chanceToday.wagered;
    const lastMonthBets = multiLM.total.wagered + (chanceLMIncl.wagered - chanceMonth.wagered);

    const monthlyPaid = multiMonth.total.paidOut + chanceMonth.paidOut;
    const weeklyPaid = multiWeek.total.paidOut + chanceWeek.paidOut;
    const dailyPaid = multiToday.total.paidOut + chanceToday.paidOut;
    const lastMonthPaid = multiLM.total.paidOut + (chanceLMIncl.paidOut - chanceMonth.paidOut);

    // ─── LOOTBOX (section dediee — deja compte dans chanceAll.byGame.lootboxes) ───
    let lootboxReceived = 0;
    let lootboxOpensCount = 0;
    let lootboxRewardTotal = 0;
    try {
      const opensList = await db.select({ lootboxId: lootboxOpens.lootboxId, rewardCrc: lootboxOpens.rewardCrc }).from(lootboxOpens);
      const prices = await db.select({ id: lootboxes.id, price: lootboxes.pricePerOpenCrc }).from(lootboxes);
      const priceMap = new Map(prices.map(l => [l.id, l.price]));
      lootboxOpensCount = opensList.length;
      for (const o of opensList) {
        lootboxReceived += priceMap.get(o.lootboxId) || 0;
        lootboxRewardTotal += Number(o.rewardCrc);
      }
    } catch {}
    const lootboxPaid = payoutsByGame.find(p => p.gameType === "lootbox");
    const lootboxPaidTotal = lootboxPaid ? Number(lootboxPaid.total) : 0;

    // ─── DAILY (section dediee — exclue des totaux pour matcher /stats) ───
    const dailyReceived = Number(dailySess[0].count);
    const dailyPaidTypes = payoutsByGame.filter(p => p.gameType.startsWith("daily-"));
    const dailyPaidTotal = dailyPaidTypes.reduce((s, p) => s + Number(p.total), 0);

    // ─── RECAP PAR JEU ───
    const gameRecaps: Array<{ key: string; played: number; totalBet: number; totalPaid: number; margin: number }> = [];

    for (const [key, stats] of Object.entries(multiAll.byGame)) {
      if (stats.rounds === 0) continue;
      gameRecaps.push({
        key,
        played: stats.rounds,
        totalBet: round(stats.wagered),
        totalPaid: round(stats.paidOut),
        margin: round(stats.wagered - stats.paidOut),
      });
    }
    for (const cfg of ALL_CHANCE_SERVER_GAMES) {
      const stats = chanceAll.byGame[cfg.key];
      if (!stats || stats.rounds === 0) continue;
      gameRecaps.push({
        key: cfg.key,
        played: stats.rounds,
        totalBet: round(stats.wagered),
        totalPaid: round(stats.paidOut),
        margin: round(stats.wagered - stats.paidOut),
      });
    }
    gameRecaps.sort((a, b) => b.totalBet - a.totalBet);

    // Revenu moyen par jour
    const firstDate = firstPayoutRow[0]?.min ? new Date(firstPayoutRow[0].min) : now;
    const daysSinceStart = Math.max(1, Math.ceil((now.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)));
    const avgRevenuePerDay = totalCommissions / daysSinceStart;

    // Safe balance
    const wei = BigInt("1000000000000000000");
    const safeBalance = safeBalRaw ? Number((safeBalRaw.erc1155 + safeBalRaw.erc20) / wei) : null;

    // dailySessMonth, dailySessLM used only if the UI needs them later — kept for future.
    void dailySessMonth; void dailySessLM; void dailySessToday; void dailySessWeek;

    return NextResponse.json({
      safeBalance: safeBalance !== null ? round(safeBalance) : null,
      totalBets: round(totalBets),
      totalRedistributed: round(totalRedistributed),
      totalCommissions: round(totalCommissions),
      totalGamesPlayed,
      avgRevenuePerDay: round(avgRevenuePerDay),
      periods: {
        today: { volume: round(dailyBets), commission: round(dailyBets - dailyPaid) },
        week: { volume: round(weeklyBets), commission: round(weeklyBets - weeklyPaid) },
        month: { volume: round(monthlyBets), commission: round(monthlyBets - monthlyPaid) },
        lastMonth: { volume: round(lastMonthBets), commission: round(lastMonthBets - lastMonthPaid) },
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
