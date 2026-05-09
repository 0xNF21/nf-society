/**
 * XP System — reads config from DB with in-memory cache.
 * Fallback to hardcoded defaults if DB is unavailable.
 */

// ─── HARDCODED DEFAULTS (fallback if DB is empty) ───

export const DEFAULT_LEVELS = [
  { level: 1,  name: "Level 1",  xpRequired: 0 },
  { level: 2,  name: "Level 2",  xpRequired: 100 },
  { level: 3,  name: "Level 3",  xpRequired: 250 },
  { level: 4,  name: "Level 4",  xpRequired: 500 },
  { level: 5,  name: "Level 5",  xpRequired: 1000 },
  { level: 6,  name: "Level 6",  xpRequired: 2000 },
  { level: 7,  name: "Level 7",  xpRequired: 4000 },
  { level: 8,  name: "Level 8",  xpRequired: 7000 },
  { level: 9,  name: "Level 9",  xpRequired: 12000 },
  { level: 10, name: "Level 10", xpRequired: 20000 },
];

export const DEFAULT_XP_REWARDS: Record<string, number> = {
  lootbox_open: 10, lootbox_rare: 10, lootbox_mega: 25, lootbox_legendary: 50, lootbox_jackpot: 100,
  morpion_win: 15, morpion_lose: 5, memory_win: 15, memory_lose: 5,
  dames_win: 20, dames_lose: 5, relics_win: 20, relics_lose: 5,
  pfc_win: 15, pfc_lose: 5,
  races_1st: 25, races_2nd: 12, races_3rd: 6, races_participated: 3,
  roulette_play: 2, roulette_win: 10,
  dice_play: 2, dice_win: 10,
  hilo_play: 2, hilo_win: 10,
  plinko_play: 2, plinko_win: 10,
  mines_play: 2, mines_win: 10,
  keno_play: 2, keno_win: 10,
  blackjack_play: 2, blackjack_win: 10,
  coin_flip_play: 2, coin_flip_win: 10,
  crash_dash_play: 2, crash_dash_win: 10,
};

// Server-side: use loadXpConfig() and invalidateXpCache() from xp-server.ts

// ─── SYNC EXPORTS (use defaults, for client-side / demo mode) ───

/** Static levels for client-side use (profile page, demo mode) */
export const LEVELS = DEFAULT_LEVELS;

/** Static rewards for client-side use (demo mode) */
export const XP_REWARDS = DEFAULT_XP_REWARDS;

// ─── PURE FUNCTIONS (work with any level data) ───

export function computeLevel(xp: number, levels = DEFAULT_LEVELS): number {
  let level = 1;
  for (const entry of levels) {
    if (xp >= entry.xpRequired) level = entry.level;
    else break;
  }
  return level;
}

export function getLevelName(level: number, levels = DEFAULT_LEVELS): string {
  return levels.find(l => l.level === level)?.name ?? `Level ${level}`;
}

export function xpToNextLevel(xp: number, levels = DEFAULT_LEVELS): number {
  const progress = getLevelProgress(xp, levels);
  if (progress.nextLevelXp === null) return 0;
  return Math.max(0, progress.nextLevelXp - xp);
}

export function getLevelProgress(xp: number, levels = DEFAULT_LEVELS): {
  currentLevelXp: number;
  nextLevel: number | null;
  nextLevelXp: number | null;
  progressPct: number;
  isMaxLevel: boolean;
} {
  const orderedLevels = [...levels].sort((a, b) => a.level - b.level);
  const currentLevel = computeLevel(xp, orderedLevels);
  const currentIndex = orderedLevels.findIndex((entry) => entry.level === currentLevel);
  const current = currentIndex >= 0 ? orderedLevels[currentIndex] : orderedLevels[0];
  const next = currentIndex >= 0 ? orderedLevels[currentIndex + 1] ?? null : null;
  const currentLevelXp = current?.xpRequired ?? 0;

  if (!next) {
    return {
      currentLevelXp,
      nextLevel: null,
      nextLevelXp: null,
      progressPct: 100,
      isMaxLevel: true,
    };
  }

  const span = next.xpRequired - currentLevelXp;
  const rawProgress = span <= 0 ? 100 : ((xp - currentLevelXp) / span) * 100;
  const progressPct = Math.max(0, Math.min(100, Math.round(rawProgress)));

  return {
    currentLevelXp,
    nextLevel: next.level,
    nextLevelXp: next.xpRequired,
    progressPct,
    isMaxLevel: false,
  };
}

export function getXpForAction(action: string, rewards = DEFAULT_XP_REWARDS): number {
  return rewards[action] ?? 0;
}

export function getLootboxXpAction(rewardCrc: number, priceCrc: number): string | null {
  const ratio = rewardCrc / priceCrc;
  if (ratio >= 7)   return "lootbox_jackpot";
  if (ratio >= 3)   return "lootbox_legendary";
  if (ratio >= 1.4) return "lootbox_mega";
  if (ratio >= 0.85) return "lootbox_rare";
  return null;
}
