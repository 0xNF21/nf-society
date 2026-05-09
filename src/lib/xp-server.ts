/**
 * Server-side XP config loader. Reads from DB with cache.
 * ONLY import this from server-side code (API routes, server components).
 */

import { db } from "@/lib/db";
import { players, shopPurchases, xpConfig, xpEvents } from "@/lib/db/schema";
import { DEFAULT_XP_REWARDS, DEFAULT_LEVELS, computeLevel, getLevelName, xpToNextLevel } from "@/lib/xp";
import { checkAndAwardBadges } from "@/lib/badges";
import { and, eq, gt, like, sql } from "drizzle-orm";

const DISABLED_DAILY_XP_ACTIONS = new Set(["daily_checkin", "daily_spin", "daily_wheel", "streak_7days"]);
const EVM_ADDRESS_RE = /^0x[a-f0-9]{40}$/;

let cachedRewards: Record<string, number> | null = null;
export type XpLevelConfig = { level: number; name: string; xpRequired: number };

let cachedLevels: XpLevelConfig[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 60_000; // 60 seconds

function isCacheValid(): boolean {
  return Date.now() - cacheTime < CACHE_TTL;
}

function normalizePlayerAddress(address: string | null | undefined): string | null {
  const addr = address?.trim().toLowerCase() ?? "";
  return EVM_ADDRESS_RE.test(addr) ? addr : null;
}

/** Load XP config from DB with cache. Server-side only. */
export async function loadXpConfig(): Promise<{
  rewards: Record<string, number>;
  levels: XpLevelConfig[];
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
    const levels: XpLevelConfig[] = [];

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

export async function refreshPlayerLevels(levels: XpLevelConfig[]): Promise<number> {
  const rows = await db.select({
    address: players.address,
    xp: players.xp,
    level: players.level,
  }).from(players);

  const changes = rows
    .map((player) => ({
      address: player.address,
      level: computeLevel(player.xp, levels),
      currentLevel: player.level,
    }))
    .filter((player) => player.level !== player.currentLevel);

  if (changes.length === 0) return 0;

  await db.transaction(async (tx) => {
    for (const player of changes) {
      await tx.update(players)
        .set({ level: player.level })
        .where(eq(players.address, player.address));
    }
  });

  return changes.length;
}

export async function awardMatchResultXp(params: {
  playerAddresses: Array<string | null | undefined>;
  winnerAddress?: string | null;
  winAction: string;
  loseAction: string;
  drawAction?: string;
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const playersInGame = Array.from(new Set(
    params.playerAddresses
      .map((address) => normalizePlayerAddress(address))
      .filter((address): address is string => !!address),
  ));

  if (playersInGame.length === 0) return;

  const winner = normalizePlayerAddress(params.winnerAddress);
  const hasWinner = !!winner && playersInGame.includes(winner);
  const drawOrFallbackAction = params.drawAction ?? params.loseAction;

  const awards = playersInGame.map((address) => ({
    address,
    action: hasWinner
      ? (address === winner ? params.winAction : params.loseAction)
      : drawOrFallbackAction,
  }));

  const results = await Promise.allSettled(
    awards.map((award) => awardPlayerXp({
      address: award.address,
      action: award.action,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      metadata: params.metadata,
    })),
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error("[XP] Match result award failed:", awards[index], result.reason);
      return;
    }
    if ("error" in result.value) {
      console.error("[XP] Match result award skipped:", awards[index], result.value.error);
    }
  });
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
  duplicate?: boolean;
  eventId?: number;
  sourceType?: string;
  sourceId?: string;
};

export type AwardPlayerXpParams = {
  address: string;
  action: string;
  xpAmount?: number;
  sourceType: string;
  sourceId: string;
  metadata?: Record<string, unknown>;
};

export async function awardPlayerXp(params: AwardPlayerXpParams): Promise<AwardPlayerXpResult | { error: "invalid_input" | "unknown_action" }> {
  const addr = normalizePlayerAddress(params.address);
  const action = params.action?.trim() ?? "";
  const sourceType = params.sourceType?.trim() ?? "";
  const sourceId = params.sourceId?.trim() ?? "";

  if (!addr || !action || !sourceType || !sourceId) {
    return { error: "invalid_input" };
  }
  if (DISABLED_DAILY_XP_ACTIONS.has(action) || action.startsWith("daily_")) {
    return { error: "unknown_action" };
  }

  const { rewards, levels } = await loadXpConfig();
  let xpGained = typeof params.xpAmount === "number" && params.xpAmount > 0
    ? Math.floor(params.xpAmount)
    : (rewards[action] ?? 0);
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
  let isNewPlayer = false;
  let isFirstLootboxAction = false;
  let isFirstWinAction = false;
  let newXp = 0;
  let fragmentsBalanceAfter = 0;
  let newStreak = 0;
  let leveledUp = false;
  let finalXpGained = xpGained;
  let eventId: number | undefined;

  const alreadyCheckedIn = await db.transaction<AwardPlayerXpResult | null>(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`xp-award:${addr}`})::bigint)`);

    const [existing] = await tx.select().from(players).where(eq(players.address, addr));
    const [existingEvent] = await tx
      .select()
      .from(xpEvents)
      .where(and(
        eq(xpEvents.address, addr),
        eq(xpEvents.action, action),
        eq(xpEvents.sourceType, sourceType),
        eq(xpEvents.sourceId, sourceId),
      ))
      .limit(1);

    if (existingEvent) {
      const currentXp = existing?.xp ?? existingEvent.xpAfter;
      const currentLevel = existing ? computeLevel(existing.xp, levels) : existingEvent.levelAfter;
      return {
        xp: currentXp,
        level: currentLevel,
        levelName: getLevelName(currentLevel, levels),
        xpGained: 0,
        levelUp: false,
        xpToNext: xpToNextLevel(currentXp, levels),
        streak: existing?.streak ?? 0,
        newBadges: [],
        message: "XP already awarded",
        duplicate: true,
        eventId: existingEvent.id,
        sourceType,
        sourceId,
      };
    }

    if (action === "lootbox_open") {
      const [previousLootbox] = await tx
        .select({ id: xpEvents.id })
        .from(xpEvents)
        .where(and(eq(xpEvents.address, addr), eq(xpEvents.action, "lootbox_open")))
        .limit(1);
      isFirstLootboxAction = !previousLootbox;
    }

    if (action.endsWith("_win")) {
      const [previousWin] = await tx
        .select({ id: xpEvents.id })
        .from(xpEvents)
        .where(and(eq(xpEvents.address, addr), like(xpEvents.action, "%_win")))
        .limit(1);
      isFirstWinAction = !previousWin;
    }

    if (!existing) {
      isNewPlayer = true;
      newXp = xpGained;
      fragmentsBalanceAfter = 0;
      newStreak = 0;
      const level = computeLevel(newXp, levels);
      await tx.insert(players).values({
        address: addr,
        xp: newXp,
        fragmentsBalance: 0,
        fragmentsSpent: 0,
        level,
        streak: newStreak,
        lastSeen: now,
        createdAt: now,
      });
      const [event] = await tx.insert(xpEvents).values({
        address: addr,
        action,
        amountXp: finalXpGained,
        sourceType,
        sourceId,
        xpAfter: newXp,
        fragmentsBalanceAfter,
        levelAfter: level,
        metadata: params.metadata ?? null,
      }).returning({ id: xpEvents.id });
      eventId = event?.id;
      return null;
    }

    const prevLevel = computeLevel(existing.xp, levels);
    newStreak = existing.streak;

    let xpCredit = xpGained;
    newXp = existing.xp + xpCredit;
    finalXpGained = xpCredit;
    fragmentsBalanceAfter = existing.fragmentsBalance;

    const newLevel = computeLevel(newXp, levels);
    leveledUp = newLevel > prevLevel;

    await tx.update(players)
      .set({
        xp: newXp,
        level: newLevel,
        streak: newStreak,
        lastSeen: now,
      })
      .where(eq(players.address, addr));

    const [event] = await tx.insert(xpEvents).values({
      address: addr,
      action,
      amountXp: finalXpGained,
      sourceType,
      sourceId,
      xpAfter: newXp,
      fragmentsBalanceAfter,
      levelAfter: newLevel,
      metadata: params.metadata ?? null,
    }).returning({ id: xpEvents.id });
    eventId = event?.id;

    return null;
  });

  if (alreadyCheckedIn) return alreadyCheckedIn;

  let newBadges: string[] = [];
  try {
    const hour = new Date().getHours();
    newBadges = await checkAndAwardBadges(addr, action, {
      hour,
      isFirstLootbox: action === "lootbox_open" && (isFirstLootboxAction || isNewPlayer),
      isFirstWin: action.endsWith("_win") && (isFirstWinAction || isNewPlayer),
    });
  } catch (badgeErr) {
    console.error("[Badge check error]", badgeErr);
  }

  const finalLevel = computeLevel(newXp, levels);
  return {
    xp: newXp,
    level: finalLevel,
    levelName: getLevelName(finalLevel, levels),
    xpGained: finalXpGained,
    levelUp: leveledUp,
    xpToNext: xpToNextLevel(newXp, levels),
    streak: newStreak,
    newBadges,
    eventId,
    sourceType,
    sourceId,
  };
}

export async function awardPlayerXpSafely(params: AwardPlayerXpParams, context?: string): Promise<void> {
  try {
    const result = await awardPlayerXp(params);
    if ("error" in result) {
      console.error("[XP] Award skipped:", context ?? params.action, {
        error: result.error,
        address: params.address,
        action: params.action,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
      });
    }
  } catch (err) {
    console.error("[XP] Award failed:", context ?? params.action, {
      address: params.address,
      action: params.action,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      error: err,
    });
  }
}
