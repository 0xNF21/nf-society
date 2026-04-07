import { db } from "@/lib/db";
import { badges, playerBadges, players } from "@/lib/db/schema";
import type { BadgeCondition } from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";

const CIRCLES_RPC_URL = process.env.NEXT_PUBLIC_CIRCLES_RPC_URL || "https://rpc.aboutcircles.com/";

export type BadgeContext = {
  rarity?: string;
  winStreak?: number;
  loseStreak?: number;
  totalLootbox?: number;
  totalWins?: number;
  hour?: number;
  isFirstLootbox?: boolean;
  isFirstWin?: boolean;
};

/**
 * Check if an action matches a condition pattern.
 * Supports wildcards: "*_win" matches "morpion_win", "pfc_win", etc.
 */
function actionMatches(action: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern === action) return true;
  if (pattern.startsWith("*")) {
    return action.endsWith(pattern.slice(1));
  }
  if (pattern.endsWith("*")) {
    return action.startsWith(pattern.slice(0, -1));
  }
  return false;
}

/**
 * Evaluate a badge condition against the current action and context.
 */
async function evaluateCondition(
  condition: BadgeCondition,
  action: string,
  context: BadgeContext,
  address: string,
): Promise<boolean> {
  // Manual badges are never auto-awarded
  if (condition.type === "manual") return false;

  // Check if action matches
  if (condition.action && !actionMatches(action, condition.action)) return false;

  switch (condition.type) {
    case "first":
      // First time doing this action
      if (condition.action?.includes("_win")) return !!context.isFirstWin;
      if (condition.action?.includes("lootbox_open")) return !!context.isFirstLootbox;
      if (condition.action?.includes("lootbox_jackpot")) return context.rarity === "jackpot";
      if (condition.action?.includes("lootbox_rare")) {
        return !!context.rarity && ["rare", "mega", "legendary", "jackpot"].includes(context.rarity);
      }
      return true;

    case "streak": {
      const needed = condition.value ?? 1;
      if (condition.action?.includes("daily_checkin")) {
        const [player] = await db.select().from(players).where(eq(players.address, address));
        return (player?.streak ?? 0) >= needed;
      }
      if (condition.action?.includes("_win")) {
        return (context.winStreak ?? 0) >= needed;
      }
      return false;
    }

    case "count": {
      const needed = condition.value ?? 1;
      if (condition.action?.includes("lootbox")) {
        return (context.totalLootbox ?? 0) >= needed;
      }
      if (condition.action?.includes("daily_checkin")) {
        // Count total players for founder/early_adopter type badges
        const [{ count: playerCount }] = await db.select({ count: count() }).from(players);
        return Number(playerCount) <= needed;
      }
      return false;
    }

    case "hour_before": {
      const hour = context.hour ?? new Date().getHours();
      return hour < (condition.value ?? 8);
    }

    case "hour_between": {
      const hour = context.hour ?? new Date().getHours();
      return hour >= (condition.min ?? 0) && hour < (condition.max ?? 4);
    }

    case "lose_streak": {
      const needed = condition.value ?? 10;
      return (context.loseStreak ?? 0) >= needed;
    }

    default:
      return false;
  }
}

/**
 * Check and award badges based on action + context.
 * Reads conditions from DB — fully configurable via admin.
 */
export async function checkAndAwardBadges(
  address: string,
  action: string,
  context: BadgeContext = {}
): Promise<string[]> {
  const addr = address.toLowerCase();

  // Load all badges with conditions
  const allBadges = await db.select().from(badges);

  // Get already earned badges for this player
  const earned = await db.select().from(playerBadges).where(eq(playerBadges.address, addr));
  const earnedSlugs = new Set(earned.map(e => e.badgeSlug));

  const awarded: string[] = [];

  for (const badge of allBadges) {
    // Skip if already earned
    if (earnedSlugs.has(badge.slug)) continue;

    // Skip if no condition configured
    const condition = badge.condition as BadgeCondition | null;
    if (!condition || condition.type === "manual") continue;

    // Evaluate condition
    try {
      const match = await evaluateCondition(condition, action, context, addr);
      if (match) {
        await db.insert(playerBadges)
          .values({ address: addr, badgeSlug: badge.slug })
          .onConflictDoNothing();
        awarded.push(badge.slug);
      }
    } catch {
      // Skip on error
    }
  }

  return awarded;
}

/**
 * Award supreme_founder badge if the address belongs to "cryptosnf" on Circles.
 */
export async function awardSupremeFounder(address: string): Promise<boolean> {
  const addr = address.toLowerCase();
  try {
    const res = await fetch(CIRCLES_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "circles_searchProfiles",
        params: ["cryptosnf"],
      }),
    });
    const data = await res.json();
    const profiles: any[] = data?.result ?? [];
    const match = profiles.find(
      (p: any) =>
        p.name === "cryptosnf" &&
        p.avatarType === "CrcV2_RegisterHuman" &&
        (p.address as string).toLowerCase() === addr
    );
    if (match) {
      await db.insert(playerBadges)
        .values({ address: addr, badgeSlug: "supreme_founder" })
        .onConflictDoNothing();
      return true;
    }
  } catch {}
  return false;
}

/**
 * Get all badges for a player, including unearned secret badges as "???".
 */
export async function getPlayerBadges(address: string) {
  const addr = address.toLowerCase();

  const allBadges = await db.select().from(badges);
  const earned = await db
    .select()
    .from(playerBadges)
    .where(eq(playerBadges.address, addr));

  const earnedSlugs = new Set(earned.map((e) => e.badgeSlug));

  return allBadges.map((badge) => {
    const isEarned = earnedSlugs.has(badge.slug);
    const earnedAt = earned.find((e) => e.badgeSlug === badge.slug)?.earnedAt ?? null;

    if (isEarned) {
      return {
        slug: badge.slug, name: badge.name, description: badge.description,
        icon: badge.icon, iconType: badge.iconType, category: badge.category,
        secret: badge.secret, earned: true, earnedAt,
      };
    }

    if (badge.secret) {
      return {
        slug: badge.slug, name: "???", description: "???",
        icon: "❓", iconType: "emoji", category: badge.category,
        secret: true, earned: false, earnedAt: null,
      };
    }

    return {
      slug: badge.slug, name: badge.name, description: badge.description,
      icon: badge.icon, iconType: badge.iconType, category: badge.category,
      secret: false, earned: false, earnedAt: null,
    };
  });
}
