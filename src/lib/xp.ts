// VALEURS PROVISOIRES — à reconfigurer plus tard

export const LEVELS = [
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
] as const;

// GAINS XP PROVISOIRES — à reconfigurer plus tard
export const XP_REWARDS: Record<string, number> = {
  lootbox_open:      10,
  lootbox_rare:      10,
  lootbox_mega:      25,
  lootbox_legendary: 50,
  lootbox_jackpot:   100,
  morpion_win:       15,
  morpion_lose:       5,
  memory_win:        15,
  memory_lose:        5,
  daily_checkin:      3,
  daily_scratch:      5,
  daily_spin:         5,
  streak_7days:      50,
  dames_win:         20,
  dames_lose:         5,
  relics_win:        20,
  relics_lose:        5,
};

export function computeLevel(xp: number): number {
  let level = 1;
  for (const entry of LEVELS) {
    if (xp >= entry.xpRequired) level = entry.level;
    else break;
  }
  return level;
}

export function getLevelName(level: number): string {
  return LEVELS.find(l => l.level === level)?.name ?? `Level ${level}`;
}

export function xpToNextLevel(xp: number): number {
  const currentLevel = computeLevel(xp);
  const next = LEVELS.find(l => l.level === currentLevel + 1);
  if (!next) return 0; // niveau max atteint
  return next.xpRequired - xp;
}

export function getXpForAction(action: string): number {
  return XP_REWARDS[action] ?? 0;
}

export function getAvailableXp(xp: number, xpSpent: number): number {
  return xp - xpSpent;
}

export function canAfford(xp: number, xpSpent: number, itemCost: number): boolean {
  return getAvailableXp(xp, xpSpent) >= itemCost;
}

/** Retourne l'action XP bonus selon le ratio reward/price */
export function getLootboxXpAction(rewardCrc: number, priceCrc: number): string | null {
  const ratio = rewardCrc / priceCrc;
  if (ratio >= 7)   return "lootbox_jackpot";
  if (ratio >= 3)   return "lootbox_legendary";
  if (ratio >= 1.4) return "lootbox_mega";
  if (ratio >= 0.85) return "lootbox_rare";
  return null;
}
