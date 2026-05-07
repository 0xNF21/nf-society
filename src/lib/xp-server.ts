/**
 * Server-side XP config loader. Reads from DB with cache.
 * ONLY import this from server-side code (API routes, server components).
 */

import { db } from "@/lib/db";
import { players, shopPurchases, xpConfig } from "@/lib/db/schema";
import { DEFAULT_XP_REWARDS, DEFAULT_LEVELS, computeLevel, getLevelName, xpToNextLevel } from "@/lib/xp";
import { checkAndAwardBadges, awardSupremeFounder } from "@/lib/badges";
import { and, eq, gt } from "drizzle-orm";

let cachedRewards: Record<string, number> | null = null;
let cachedLevels: { level: number; name: string; xpRequired: number }[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

function isCacheValid(): boolean {
  return Date.now() - cacheTime < CACHE_TTL;
}

/** Load XP config from DB with cache. Server-side only. */
export async function loadXpConfig(): Promise<{
  rewards: Record<string, number>;
  levels: { level: number; name: string; xpRequired: number }[];
}> {
  if (cachedRewards && cachedLevels && isCacheValid()) {
    return { rewards: cachedRewards, levels: cachedLevels };
  }

  try {
    const rows = await db.select().from(xpConfig);

    if (rows.length === 0) {
      return { rewards: DEFAULT_XP_REWARDS, levels: [...DEFAULT_LEVELS] };
    }

    const rewards: Record<string, number> = {};
    const levels: { level: number; name: string; xpRequired: number }[] = [];

    for (const row of rows) {
      if (row.category === "level") {
        const levelNum = parseInt(row.key.replace("level_", ""));
        if (!isNaN(levelNum)) {
          levels.push({ level: levelNum, name: row.label, xpRequired: row.value });
        }
      } else {
        rewards[row.key] = row.value;
      }
    }

    levels.sort((a, b) => a.level - b.level);

    if (levels.length === 0) levels.push(...DEFAULT_LEVELS);

    for (const [key, value] of Object.entries(DEFAULT_XP_REWARDS)) {
      if (!(key in rewards)) rewards[key] = value;
    }

    cachedRewards = rewards;
    cachedLevels = levels;
    cacheTime = Date.now();

    return { rewards, levels };
  } catch {
    return { rewards: DEFAULT_XP_REWARDS, levels: [...DEFAULT_LEVELS] };
  }
}

/** Invalidate cache (call after admin updates) */
export function invalidateXpCache(): void {
  cachedRewards = null;
  cachedLevels = null;
  cacheTime = 0;
}

export type AwardPlayerXpResult = {
  xp: number;
  level: number;
  levelName: string;
  xpGained: number;
  levelUp: boolean;
  xpToNext: number;
  streak: number;
  newBadges: string[];
  message?: string;
};

export async function awardPlayerXp(params: {
  address: string;
  action: string;
  xpAmount?: number;
}): Promise<AwardPlayerXpResult | { error: "invalid_input" | "unknown_action" }> {
  const addr = params.address.toLowerCase();
  if (!addr || !params.action) return { error: "invalid_input" };

  const { rewards, levels } = await loadXpConfig();
  let xpGained = typeof params.xpAmount === "number" && params.xpAmount > 0
    ? Math.floor(params.xpAmount)
    : (rewards[params.action] ?? 0);
  if (xpGained === 0) return { error: "unknown_action" };

  try {
    const now = new Date();
    const activeBoosts = await db
      .select({ itemSlug: shopPurchases.itemSlug })
      .from(shopPurchases)
      .where(
        and(
          eq(shopPurchases.address, addr),
          gt(shopPurchases.expiresAt, now),
        )
      );

    const hasBoost24h = activeBoosts.some(b => b.itemSlug === "xp_boost_24h");
    const hasBoost7d = activeBoosts.some(b => b.itemSlug === "xp_boost_7d");

    if (hasBoost24h) {
      xpGained = Math.floor(xpGained * 2);
    } else if (hasBoost7d) {
      xpGained = Math.floor(xpGained * 1.5);
    }
  } catch {
    // boost check fail silencieux
  }

  const now = new Date();
  const [existing] = await db.select().from(players).where(eq(players.address, addr));

  let newXp: number;
  let newStreak: number;
  let leveledUp = false;

  if (!existing) {
    newXp = xpGained;
    newStreak = params.action === "daily_checkin" ? 1 : 0;
    const level = computeLevel(newXp, levels);
    await db.insert(players).values({
      address: addr,
      xp: newXp,
      level,
      streak: newStreak,
      lastSeen: now,
      createdAt: now,
    });
  } else {
    const prevLevel = computeLevel(existing.xp, levels);

    if (params.action === "daily_checkin") {
      const lastSeen = existing.lastSeen;
      const diffMs = now.getTime() - lastSeen.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays < 1) {
        return {
          xp: existing.xp,
          level: prevLevel,
          levelName: getLevelName(prevLevel, levels),
          xpGained: 0,
          levelUp: false,
          xpToNext: xpToNextLevel(existing.xp, levels),
          streak: existing.streak,
          newBadges: [],
          message: "Already checked in today",
        };
      }

      newStreak = diffDays === 1 ? existing.streak + 1 : 1;
    } else {
      newStreak = existing.streak;
    }

    newXp = existing.xp + xpGained;

    if (params.action === "daily_checkin" && newStreak === 7) {
      newXp += rewards["streak_7days"] ?? 50;
    }

    const newLevel = computeLevel(newXp, levels);
    leveledUp = newLevel > prevLevel;

    await db.update(players)
      .set({ xp: newXp, level: newLevel, streak: newStreak, lastSeen: now })
      .where(eq(players.address, addr));
  }

  let newBadges: string[] = [];
  try {
    const hour = new Date().getHours();
    const isNew = !existing;
    newBadges = await checkAndAwardBadges(addr, params.action, {
      hour,
      isFirstLootbox: params.action === "lootbox_open" && isNew,
      isFirstWin: params.action.endsWith("_win") && isNew,
    });
    if (params.action === "daily_checkin" && isNew) {
      await awardSupremeFounder(addr);
    }
  } catch (badgeErr) {
    console.error("[Badge check error]", badgeErr);
  }

  const finalLevel = computeLevel(newXp, levels);
  return {
    xp: newXp,
    level: finalLevel,
    levelName: getLevelName(finalLevel, levels),
    xpGained,
    levelUp: leveledUp,
    xpToNext: xpToNextLevel(newXp, levels),
    streak: newStreak,
    newBadges,
  };
}
