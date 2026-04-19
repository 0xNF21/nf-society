import { db } from "./db";
import { privacySettings } from "./db/schema";
import { eq } from "drizzle-orm";

export type PrivacyFlags = {
  hidePnl: boolean;
  hideTotalBet: boolean;
  hideXpSpent: boolean;
  hideGameHistory: boolean;
  hideFromLeaderboard: boolean;
  hideFromSearch: boolean;
};

export const DEFAULT_PRIVACY: PrivacyFlags = {
  hidePnl: false,
  hideTotalBet: false,
  hideXpSpent: false,
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
      hideXpSpent: row.hideXpSpent,
      hideGameHistory: row.hideGameHistory,
      hideFromLeaderboard: row.hideFromLeaderboard,
      hideFromSearch: row.hideFromSearch,
    };
  } catch {
    return DEFAULT_PRIVACY;
  }
}
