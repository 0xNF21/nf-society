/**
 * Game Registry — single source of truth for all multiplayer games.
 * This file is SAFE to import from client components (no DB imports).
 *
 * To add a new game, add an entry to GAME_REGISTRY below.
 * For server-side config (DB tables), update game-registry-server.ts too.
 */

export type GameClientConfig = {
  key: string;
  featureFlag: string;
  emoji: string;
  iconColor: string;
  iconBg: string;
  iconBgHover: string;
  borderHover: string;
  accentColor: string;
  translationKey: string;
  landingTranslationKey: string;
  apiRoute: string;
  scanRoute: string;
};

export const GAME_REGISTRY: Record<string, GameClientConfig> = {
  morpion: {
    key: "morpion",
    featureFlag: "morpion",
    emoji: "❌",
    iconColor: "text-violet-500",
    iconBg: "bg-violet-50",
    iconBgHover: "group-hover:bg-violet-100",
    borderHover: "hover:border-violet-200",
    accentColor: "#251B9F",
    translationKey: "morpion",
    landingTranslationKey: "landingMorpion",
    apiRoute: "/api/morpion",
    scanRoute: "/api/morpion-scan",
  },

  memory: {
    key: "memory",
    featureFlag: "memory",
    emoji: "🃏",
    iconColor: "text-pink-500",
    iconBg: "bg-pink-50",
    iconBgHover: "group-hover:bg-pink-100",
    borderHover: "hover:border-pink-200",
    accentColor: "#EC4899",
    translationKey: "memory",
    landingTranslationKey: "landingMemory",
    apiRoute: "/api/memory",
    scanRoute: "/api/memory-scan",
  },

  relics: {
    key: "relics",
    featureFlag: "relics",
    emoji: "⚓",
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-50",
    iconBgHover: "group-hover:bg-emerald-100",
    borderHover: "hover:border-emerald-200",
    accentColor: "#251B9F",
    translationKey: "relics",
    landingTranslationKey: "landingRelics",
    apiRoute: "/api/relics",
    scanRoute: "/api/relics-scan",
  },

  dames: {
    key: "dames",
    featureFlag: "dames",
    emoji: "♟️",
    iconColor: "text-amber-500",
    iconBg: "bg-amber-50",
    iconBgHover: "group-hover:bg-amber-100",
    borderHover: "hover:border-amber-200",
    accentColor: "#251B9F",
    translationKey: "dames",
    landingTranslationKey: "landingDames",
    apiRoute: "/api/dames",
    scanRoute: "/api/dames-scan",
  },
  pfc: {
    key: "pfc",
    featureFlag: "pfc",
    emoji: "✊",
    iconColor: "text-red-500",
    iconBg: "bg-red-50",
    iconBgHover: "group-hover:bg-red-100",
    borderHover: "hover:border-red-200",
    accentColor: "#DC2626",
    translationKey: "pfc",
    landingTranslationKey: "landingPfc",
    apiRoute: "/api/pfc",
    scanRoute: "/api/pfc-scan",
  },
};

export const ALL_GAMES = Object.values(GAME_REGISTRY);

/* ═══════════════════════════════════════════════════
   CHANCE GAMES REGISTRY
   Jeux de chance / gambling — auto-creates feature flags in admin.
   To add a new chance game, add an entry here.
   ═══════════════════════════════════════════════════ */
export type ChanceGameConfig = {
  key: string;
  featureFlag: string;
  label: string;
};

export const CHANCE_REGISTRY: Record<string, ChanceGameConfig> = {
  daily: { key: "daily", featureFlag: "daily", label: "Daily Reward" },
  lotteries: { key: "lotteries", featureFlag: "lotteries", label: "Loteries" },
  lootboxes: { key: "lootboxes", featureFlag: "lootboxes", label: "Lootboxes" },
  blackjack: { key: "blackjack", featureFlag: "blackjack", label: "Blackjack" },
  coin_flip: { key: "coin_flip", featureFlag: "coin_flip", label: "Pile ou Face" },
  hilo: { key: "hilo", featureFlag: "hilo", label: "Hi-Lo" },
  mines: { key: "mines", featureFlag: "mines", label: "Mines" },
};

export const ALL_CHANCE_GAMES = Object.values(CHANCE_REGISTRY);

/* ═══════════════════════════════════════════════════
   CATEGORY FLAGS
   Sections / categories de la plateforme — auto-creates feature flags in admin.
   ═══════════════════════════════════════════════════ */
export const CATEGORY_FLAGS: { key: string; label: string }[] = [
  { key: "chance", label: "Chance (section)" },
  { key: "multiplayer", label: "Multijoueur (section)" },
  { key: "shop", label: "Boutique" },
  { key: "governance", label: "Gouvernance" },
  { key: "exchange", label: "Exchange" },
  { key: "lobby", label: "Lobby multijoueur" },
  { key: "leaderboard", label: "Classement" },
];

/** Game display labels (for stats, lobby, etc.) */
export const GAME_LABELS: Record<string, string> = {
  morpion: "Morpion",
  memory: "Memory",
  relics: "Relics",
  dames: "Dames",
  pfc: "Pierre-Feuille-Ciseaux",
};

/** Game icons for stats display */
export const GAME_ICONS: Record<string, string> = {
  morpion: "❌⭕",
  memory: "🃏",
  relics: "⚓",
  dames: "♟️",
  pfc: "✊📄✂️",
};
