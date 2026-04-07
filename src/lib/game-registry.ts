/**
 * Game Registry — single source of truth for all multiplayer games.
 *
 * To add a new game, add an entry to GAME_REGISTRY below.
 * Stats, lobby, admin, and multijoueur page will pick it up automatically.
 */

import { morpionGames, memoryGames, relicsGames, damesGames } from "@/lib/db/schema";

export type GameConfig = {
  // Identity
  key: string;
  featureFlag: string;

  // Display
  emoji: string;
  iconColor: string;
  iconBg: string;
  iconBgHover: string;
  borderHover: string;
  accentColor: string;

  // i18n — keys in translations object
  translationKey: string;
  landingTranslationKey: string;

  // DB — drizzle table reference
  table: any;

  // API routes
  apiRoute: string;
  scanRoute: string;

  // Game flow
  activeStatus: string; // status after both players paid: "active", "playing", "placing"
  skipStatuses: string[]; // statuses that mean "already started or finished"

  // Game-specific creation fields
  createExtraFields?: (body: Record<string, unknown>) => Record<string, unknown>;
  createExtraValidation?: (body: Record<string, unknown>) => string | null;

  // Called when both players have paid — return extra fields to set on the game row
  onBothPlayersPaid?: () => Record<string, unknown>;
};

export const GAME_REGISTRY: Record<string, GameConfig> = {
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
    table: morpionGames,
    apiRoute: "/api/morpion",
    scanRoute: "/api/morpion-scan",
    activeStatus: "active",
    skipStatuses: ["active", "finished", "cancelled"],
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
    table: memoryGames,
    apiRoute: "/api/memory",
    scanRoute: "/api/memory-scan",
    activeStatus: "playing",
    skipStatuses: ["playing", "finished", "cancelled"],
    createExtraFields: (body) => ({
      difficulty: body.difficulty || "medium",
      gridSeed: Math.random().toString(36).slice(2, 10),
    }),
    createExtraValidation: (body) => {
      if (body.difficulty && !["easy", "medium", "hard"].includes(body.difficulty as string)) {
        return "Invalid difficulty";
      }
      return null;
    },
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
    table: relicsGames,
    apiRoute: "/api/relics",
    scanRoute: "/api/relics-scan",
    activeStatus: "placing",
    skipStatuses: ["placing", "playing", "finished"],
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
    table: damesGames,
    apiRoute: "/api/dames",
    scanRoute: "/api/dames-scan",
    activeStatus: "playing",
    skipStatuses: ["playing", "finished"],
    onBothPlayersPaid: () => {
      // Lazy import to avoid circular deps — will be called server-side only
      const { createInitialState } = require("@/lib/dames");
      return { gameState: createInitialState() };
    },
  },
};

export const ALL_GAMES = Object.values(GAME_REGISTRY);

/** Get a game config by key, throws if not found */
export function getGameConfig(key: string): GameConfig {
  const config = GAME_REGISTRY[key];
  if (!config) throw new Error(`Unknown game: ${key}`);
  return config;
}

/** Game display labels (for stats, lobby, etc.) */
export const GAME_LABELS: Record<string, string> = {
  morpion: "Morpion",
  memory: "Memory",
  relics: "Relics",
  dames: "Dames",
};

/** Game icons for stats display */
export const GAME_ICONS: Record<string, string> = {
  morpion: "❌⭕",
  memory: "🃏",
  relics: "⚓",
  dames: "♟️",
};
