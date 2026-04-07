/**
 * Server-side XP config loader. Reads from DB with cache.
 * ONLY import this from server-side code (API routes, server components).
 */

import { db } from "@/lib/db";
import { xpConfig } from "@/lib/db/schema";
import { DEFAULT_XP_REWARDS, DEFAULT_LEVELS } from "@/lib/xp";

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
