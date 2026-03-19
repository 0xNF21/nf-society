import { db } from "@/lib/db";
import { badges, playerBadges, players } from "@/lib/db/schema";
import { eq, and, sql, count } from "drizzle-orm";

const CIRCLES_RPC_URL = process.env.NEXT_PUBLIC_CIRCLES_RPC_URL || "https://rpc.aboutcircles.com/";

type BadgeContext = {
  rarity?: string;        // "common" | "rare" | "mega" | "legendary" | "jackpot"
  winStreak?: number;
  loseStreak?: number;
  totalLootbox?: number;
  totalWins?: number;
  hour?: number;
  isFirstLootbox?: boolean;
  isFirstWin?: boolean;
};

/**
 * Check and award badges based on action + context.
 * Returns array of newly awarded badge slugs.
 */
export async function checkAndAwardBadges(
  address: string,
  action: string,
  context: BadgeContext = {}
): Promise<string[]> {
  const addr = address.toLowerCase();
  const toAward: string[] = [];

  // --- Game badges ---
  if (action === "lootbox_open") {
    if (context.isFirstLootbox) toAward.push("first_lootbox");
    if (context.rarity === "jackpot") toAward.push("first_jackpot");
    if (context.rarity === "jackpot" && context.isFirstLootbox) toAward.push("the_one");
    if (context.rarity && ["rare", "mega", "legendary", "jackpot"].includes(context.rarity)) {
      toAward.push("lucky_rare");
    }
    if (context.totalLootbox && context.totalLootbox >= 50) toAward.push("high_roller");
  }

  if (action === "morpion_win") {
    if (context.isFirstWin) toAward.push("first_win");
    if (context.winStreak && context.winStreak >= 5) toAward.push("unstoppable");
  }

  if (action === "morpion_lose") {
    if (context.loseStreak && context.loseStreak >= 10) toAward.push("die_hard");
  }

  // --- Activity badges ---
  if (action === "daily_checkin") {
    const hour = context.hour ?? new Date().getHours();
    if (hour < 8) toAward.push("early_bird");
    if (hour >= 0 && hour < 4) toAward.push("night_owl");

    // Check streak from DB
    const [player] = await db.select().from(players).where(eq(players.address, addr));
    if (player) {
      const streak = player.streak;
      if (streak >= 3) toAward.push("streak_3");
      if (streak >= 7) toAward.push("streak_7");
      if (streak >= 30) toAward.push("streak_30");
    }

    // Check ghost badge (30+ days inactivity)
    if (player) {
      const diffMs = Date.now() - player.lastSeen.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays >= 30) toAward.push("ghost");
    }

    // Event badges: founder / early_adopter
    const [{ count: playerCount }] = await db
      .select({ count: count() })
      .from(players);
    if (Number(playerCount) <= 100) toAward.push("founder");
    if (Number(playerCount) <= 500) toAward.push("early_adopter");
  }

  // --- Insert badges (skip duplicates) ---
  const awarded: string[] = [];
  for (const slug of toAward) {
    try {
      await db.insert(playerBadges)
        .values({ address: addr, badgeSlug: slug })
        .onConflictDoNothing();
      awarded.push(slug);
    } catch {
      // ignore
    }
  }

  return awarded;
}

/**
 * Award supreme_founder badge if the address belongs to "cryptosnf" on Circles.
 * Called on first daily_checkin of an address.
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
  } catch {
    // non-blocking
  }
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
        slug: badge.slug,
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        iconType: badge.iconType,
        category: badge.category,
        secret: badge.secret,
        earned: true,
        earnedAt,
      };
    }

    // Not earned
    if (badge.secret) {
      return {
        slug: badge.slug,
        name: "???",
        description: "???",
        icon: "❓",
        iconType: "emoji",
        category: badge.category,
        secret: true,
        earned: false,
        earnedAt: null,
      };
    }

    return {
      slug: badge.slug,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      iconType: badge.iconType,
      category: badge.category,
      secret: false,
      earned: false,
      earnedAt: null,
    };
  });
}
