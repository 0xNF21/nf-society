import { db } from "./db";
import { privacySettings } from "./db/schema";
import { eq } from "drizzle-orm";
import type { FullGameStat, PlayerStats } from "@/lib/multiplayer";

export type PrivacyFlags = {
  hidePnl: boolean;
  hideTotalBet: boolean;
  hideFragmentsSpent: boolean;
  hideGameHistory: boolean;
  hideFromLeaderboard: boolean;
  hideFromSearch: boolean;
};

export const DEFAULT_PRIVACY: PrivacyFlags = {
  hidePnl: false,
  hideTotalBet: false,
  hideFragmentsSpent: false,
  hideGameHistory: false,
  hideFromLeaderboard: false,
  hideFromSearch: false,
};

export async function getPrivacyFlags(address: string): Promise<PrivacyFlags> {
  try {
    const [row] = await db
      .select()
      .from(privacySettings)
      .where(eq(privacySettings.address, address.toLowerCase()))
      .limit(1);

    if (!row) return DEFAULT_PRIVACY;

    return {
      hidePnl: row.hidePnl,
      hideTotalBet: row.hideTotalBet,
      hideFragmentsSpent: row.hideFragmentsSpent,
      hideGameHistory: row.hideGameHistory,
      hideFromLeaderboard: row.hideFromLeaderboard,
      hideFromSearch: row.hideFromSearch,
    };
  } catch {
    return DEFAULT_PRIVACY;
  }
}

export function applyPlayerStatsPrivacy(stats: PlayerStats, privacy: PrivacyFlags): PlayerStats {
  return {
    ...stats,
    totalBet: privacy.hideTotalBet ? 0 : stats.totalBet,
    totalWon: privacy.hidePnl ? 0 : stats.totalWon,
    history: privacy.hideGameHistory
      ? []
      : stats.history.map((entry) => ({
          ...entry,
          betCrc: privacy.hideTotalBet ? 0 : entry.betCrc,
        })),
  };
}

export function applyGameBreakdownPrivacy(
  breakdown: FullGameStat[],
  privacy: PrivacyFlags,
): FullGameStat[] {
  return breakdown.map((entry) => ({
    ...entry,
    wagered: privacy.hideTotalBet ? 0 : entry.wagered,
    won: privacy.hidePnl ? 0 : entry.won,
    net: privacy.hidePnl ? 0 : entry.net,
    lastPlayedAt: privacy.hideGameHistory ? null : entry.lastPlayedAt,
  }));
}
