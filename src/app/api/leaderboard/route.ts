import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { players, payouts } from "@/lib/db/schema";
import { desc, sql, eq, and, gte } from "drizzle-orm";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";

export const dynamic = "force-dynamic";

type LeaderboardEntry = {
  address: string;
  xp: number;
  level: number;
  wins: number;
  losses: number;
  winRate: number;
  gamesPlayed: number;
  crcWon: number;
};

function getPeriodDate(period: string): Date | null {
  const now = new Date();
  if (period === "week") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type") || "xp";
    const period = req.nextUrl.searchParams.get("period") || "all";
    const game = req.nextUrl.searchParams.get("game") || "all";

    // For XP leaderboard, just query players table
    if (type === "xp") {
      const topPlayers = await db.select({
        address: players.address,
        xp: players.xp,
        level: players.level,
      }).from(players).orderBy(desc(players.xp)).limit(50);

      return NextResponse.json({
        type,
        entries: topPlayers.map((p, i) => ({
          rank: i + 1,
          address: p.address,
          xp: p.xp,
          level: p.level,
          value: p.xp,
          label: `${p.xp.toLocaleString()} XP`,
        })),
      });
    }

    // For wins/winrate/crc, query game tables
    const periodDate = getPeriodDate(period);
    const gameConfigs = game === "all" ? ALL_SERVER_GAMES : ALL_SERVER_GAMES.filter(g => g.key === game);

    // Aggregate wins/losses per player across all selected games
    const playerStats = new Map<string, { wins: number; losses: number; crcWon: number }>();

    for (const config of gameConfigs) {
      const conditions = [eq(config.table.status, "finished")];
      if (periodDate) conditions.push(gte(config.table.updatedAt, periodDate));

      const games = await db.select({
        player1Address: config.table.player1Address,
        player2Address: config.table.player2Address,
        winnerAddress: config.table.winnerAddress,
        betCrc: config.table.betCrc,
        commissionPct: config.table.commissionPct,
      }).from(config.table).where(and(...conditions));

      for (const g of games) {
        const p1 = g.player1Address?.toLowerCase();
        const p2 = g.player2Address?.toLowerCase();
        const winner = g.winnerAddress?.toLowerCase();

        if (p1) {
          const stats = playerStats.get(p1) || { wins: 0, losses: 0, crcWon: 0 };
          if (winner === p1) {
            stats.wins++;
            stats.crcWon += g.betCrc * 2 * (1 - (g.commissionPct || 5) / 100);
          } else if (winner) {
            stats.losses++;
          }
          playerStats.set(p1, stats);
        }

        if (p2) {
          const stats = playerStats.get(p2) || { wins: 0, losses: 0, crcWon: 0 };
          if (winner === p2) {
            stats.wins++;
            stats.crcWon += g.betCrc * 2 * (1 - (g.commissionPct || 5) / 100);
          } else if (winner) {
            stats.losses++;
          }
          playerStats.set(p2, stats);
        }
      }
    }

    // Build entries
    let entries = Array.from(playerStats.entries()).map(([address, stats]) => {
      const total = stats.wins + stats.losses;
      return {
        address,
        wins: stats.wins,
        losses: stats.losses,
        gamesPlayed: total,
        winRate: total >= 5 ? Math.round((stats.wins / total) * 100) : 0,
        crcWon: Math.round(stats.crcWon * 10) / 10,
      };
    });

    // Sort by type
    if (type === "wins") {
      entries.sort((a, b) => b.wins - a.wins);
    } else if (type === "winrate") {
      entries = entries.filter(e => e.gamesPlayed >= 5); // min 5 games
      entries.sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);
    } else if (type === "crc") {
      entries.sort((a, b) => b.crcWon - a.crcWon);
    }

    // Get XP/level for each player
    const addresses = entries.slice(0, 50).map(e => e.address);
    const playerData = addresses.length > 0
      ? await db.select({ address: players.address, xp: players.xp, level: players.level }).from(players)
      : [];
    const playerMap = new Map(playerData.map(p => [p.address.toLowerCase(), p]));

    return NextResponse.json({
      type,
      period,
      game,
      entries: entries.slice(0, 50).map((e, i) => {
        const p = playerMap.get(e.address);
        return {
          rank: i + 1,
          address: e.address,
          xp: p?.xp ?? 0,
          level: p?.level ?? 1,
          wins: e.wins,
          losses: e.losses,
          gamesPlayed: e.gamesPlayed,
          winRate: e.winRate,
          crcWon: e.crcWon,
          value: type === "wins" ? e.wins : type === "winrate" ? e.winRate : e.crcWon,
          label: type === "wins" ? `${e.wins} victoires` :
                 type === "winrate" ? `${e.winRate}% WR` :
                 `${e.crcWon} CRC`,
        };
      }),
    });
  } catch (error) {
    console.error("[Leaderboard] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
