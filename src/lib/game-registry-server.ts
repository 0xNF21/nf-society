/**
 * Server-side game registry — extends the client registry with DB tables.
 * ONLY import this from server-side code (API routes, server components).
 */

import { morpionGames, memoryGames, relicsGames, damesGames } from "@/lib/db/schema";

export type GameServerConfig = {
  key: string;
  table: any;
  activeStatus: string;
  skipStatuses: string[];
  createExtraFields?: (body: Record<string, unknown>) => Record<string, unknown>;
  createExtraValidation?: (body: Record<string, unknown>) => string | null;
  onBothPlayersPaid?: () => Record<string, unknown>;
};

export const GAME_SERVER_REGISTRY: Record<string, GameServerConfig> = {
  morpion: {
    key: "morpion",
    table: morpionGames,
    activeStatus: "active",
    skipStatuses: ["active", "finished", "cancelled"],
  },

  memory: {
    key: "memory",
    table: memoryGames,
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
    table: relicsGames,
    activeStatus: "placing",
    skipStatuses: ["placing", "playing", "finished"],
  },

  dames: {
    key: "dames",
    table: damesGames,
    activeStatus: "playing",
    skipStatuses: ["playing", "finished"],
    onBothPlayersPaid: () => {
      const { createInitialState } = require("@/lib/dames");
      return { gameState: createInitialState() };
    },
  },
};

export const ALL_SERVER_GAMES = Object.values(GAME_SERVER_REGISTRY);

export function getServerGameConfig(key: string): GameServerConfig {
  const config = GAME_SERVER_REGISTRY[key];
  if (!config) throw new Error(`Unknown game: ${key}`);
  return config;
}
