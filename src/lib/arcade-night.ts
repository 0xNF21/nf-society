import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  adminAuditLogs,
  seasonGames,
  seasons,
  type SeasonGameRow,
  type SeasonRow,
  type SeasonStatus,
} from "@/lib/db/schema";

export const ARCADE_NIGHT_SLUG = "arcade-night-1";

export type ArcadeNightGameKey = "memory" | "dames";

export type ArcadeNightGameConfig = {
  key: ArcadeNightGameKey;
  label: string;
  enabled: boolean;
  maxMatches: number;
  maxMatchesPerOpponent: number;
  minMatches: number;
  minOpponents: number;
  sortOrder: number;
};

export type ArcadeNightReward = {
  key: string;
  label: string;
  amountCrc: number;
};

export type ArcadeNightConfig = {
  slug: string;
  title: string;
  status: SeasonStatus;
  publicStatus: string;
  startAt: string | null;
  durationMinutes: number;
  poolCrc: number;
  betaParticipants: string[];
  games: ArcadeNightGameConfig[];
  rewards: ArcadeNightReward[];
  note: string;
};

export type ArcadeNightPublicState = {
  tableReady: boolean;
  config: ArcadeNightConfig;
  updatedAt: string | null;
};

type ConfigRecord = Record<string, unknown>;

const VALID_STATUSES: SeasonStatus[] = ["draft", "scheduled", "active", "review", "finalized"];

const DEFAULT_GAMES: ArcadeNightGameConfig[] = [
  {
    key: "memory",
    label: "Memory",
    enabled: true,
    maxMatches: 6,
    maxMatchesPerOpponent: 3,
    minMatches: 3,
    minOpponents: 2,
    sortOrder: 1,
  },
  {
    key: "dames",
    label: "Dames",
    enabled: true,
    maxMatches: 3,
    maxMatchesPerOpponent: 2,
    minMatches: 2,
    minOpponents: 2,
    sortOrder: 2,
  },
];

export const DEFAULT_ARCADE_NIGHT_CONFIG: ArcadeNightConfig = {
  slug: ARCADE_NIGHT_SLUG,
  title: "NF Arcade Night #1",
  status: "draft",
  publicStatus: "Beta fermee bientot",
  startAt: null,
  durationMinutes: 90,
  poolCrc: 5000,
  betaParticipants: [],
  games: DEFAULT_GAMES,
  rewards: buildRewards(5000),
  note: "Beta fermee avec quelques membres NF Society pour tester Memory, Dames, le leaderboard et la review.",
};

export class ArcadeNightValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArcadeNightValidationError";
  }
}

export class ArcadeNightTablesUnavailableError extends Error {
  constructor() {
    super("Season tables are not available yet.");
    this.name = "ArcadeNightTablesUnavailableError";
  }
}

export function buildRewards(poolCrc: number): ArcadeNightReward[] {
  const rounded = (ratio: number) => Math.round(poolCrc * ratio * 100) / 100;
  return [
    { key: "memory1", label: "Memory #1", amountCrc: rounded(0.3) },
    { key: "memory2", label: "Memory #2", amountCrc: rounded(0.15) },
    { key: "dames1", label: "Dames #1", amountCrc: rounded(0.3) },
    { key: "dames2", label: "Dames #2", amountCrc: rounded(0.15) },
    { key: "helper", label: "Beta helper / bug report", amountCrc: rounded(0.1) },
  ];
}

export async function getArcadeNightPublicState(): Promise<ArcadeNightPublicState> {
  try {
    const [season] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.slug, ARCADE_NIGHT_SLUG))
      .limit(1);

    if (!season) {
      return {
        tableReady: true,
        config: DEFAULT_ARCADE_NIGHT_CONFIG,
        updatedAt: null,
      };
    }

    const games = await db
      .select()
      .from(seasonGames)
      .where(eq(seasonGames.seasonSlug, ARCADE_NIGHT_SLUG))
      .orderBy(asc(seasonGames.sortOrder));

    return {
      tableReady: true,
      config: normalizeConfig(season, games),
      updatedAt: season.updatedAt?.toISOString() ?? null,
    };
  } catch (error) {
    if (isRecoverableSeasonReadError(error)) {
      console.warn("[Arcade Night] Falling back to default config:", error);
      return {
        tableReady: false,
        config: DEFAULT_ARCADE_NIGHT_CONFIG,
        updatedAt: null,
      };
    }
    throw error;
  }
}

export async function updateArcadeNightConfig(input: unknown, audit?: {
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<ArcadeNightPublicState> {
  const config = validateConfig(input);
  const startAt = config.startAt ? new Date(config.startAt) : null;
  const endAt = startAt ? new Date(startAt.getTime() + config.durationMinutes * 60_000) : null;
  const now = new Date();

  try {
    const [existingSeason] = await db
      .select({ config: seasons.config })
      .from(seasons)
      .where(eq(seasons.slug, ARCADE_NIGHT_SLUG))
      .limit(1);
    const existingArcadeConfig = readArcadeConfig(existingSeason?.config);
    const seasonConfig = buildSeasonConfig(config, existingArcadeConfig);

    await db.transaction(async (tx) => {
      await tx
        .insert(seasons)
        .values({
          slug: ARCADE_NIGHT_SLUG,
          title: config.title,
          status: config.status,
          startAt,
          endAt,
          poolCrc: config.poolCrc,
          config: seasonConfig,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: seasons.slug,
          set: {
            title: config.title,
            status: config.status,
            startAt,
            endAt,
            poolCrc: config.poolCrc,
            config: seasonConfig,
            updatedAt: now,
          },
        });

      for (const game of config.games) {
        await tx
          .insert(seasonGames)
          .values({
            seasonSlug: ARCADE_NIGHT_SLUG,
            gameKey: game.key,
            label: game.label,
            enabled: game.enabled,
            visibleInLobby: game.enabled,
            countsForLeaderboard: game.enabled,
            pointsWin: 10,
            pointsDraw: 5,
            pointsLoss: 2,
            sortOrder: game.sortOrder,
            config: buildGameConfig(game),
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [seasonGames.seasonSlug, seasonGames.gameKey],
            set: {
              label: game.label,
              enabled: game.enabled,
              visibleInLobby: game.enabled,
              countsForLeaderboard: game.enabled,
              sortOrder: game.sortOrder,
              config: buildGameConfig(game),
              updatedAt: now,
            },
          });
      }

      await tx.insert(adminAuditLogs).values({
        action: "arcade_night_config_update",
        seasonSlug: ARCADE_NIGHT_SLUG,
        actor: "admin",
        ipAddress: audit?.ipAddress ?? null,
        userAgent: audit?.userAgent ?? null,
        summary: `Updated ${config.title} (${config.poolCrc} CRC, ${config.durationMinutes} min)`,
        metadata: {
          status: config.status,
          startAt: config.startAt,
          durationMinutes: config.durationMinutes,
          poolCrc: config.poolCrc,
          games: config.games.map((game) => ({
            key: game.key,
            enabled: game.enabled,
            maxMatches: game.maxMatches,
          })),
          participantCount: config.betaParticipants.length,
        },
      });
    });
  } catch (error) {
    if (isRecoverableSeasonReadError(error)) {
      throw new ArcadeNightTablesUnavailableError();
    }
    throw error;
  }

  return getArcadeNightPublicState();
}

function validateConfig(input: unknown): ArcadeNightConfig {
  if (!isRecord(input)) throw new ArcadeNightValidationError("Payload invalide.");

  const title = readString(input.title, DEFAULT_ARCADE_NIGHT_CONFIG.title).slice(0, 90).trim();
  if (title.length < 3) throw new ArcadeNightValidationError("Le titre doit faire au moins 3 caracteres.");

  const status = readStatus(input.status);
  const publicStatus = readString(input.publicStatus, DEFAULT_ARCADE_NIGHT_CONFIG.publicStatus).slice(0, 80).trim();
  const startAt = readNullableDate(input.startAt);
  const durationMinutes = clampInteger(input.durationMinutes, 30, 240, DEFAULT_ARCADE_NIGHT_CONFIG.durationMinutes);
  const poolCrc = clampNumber(input.poolCrc, 0, 100_000, DEFAULT_ARCADE_NIGHT_CONFIG.poolCrc);
  const betaParticipants = readParticipants(input.betaParticipants);
  const note = readString(input.note, DEFAULT_ARCADE_NIGHT_CONFIG.note).slice(0, 320).trim();
  const games = readGames(input.games);

  if (!games.some((game) => game.enabled)) {
    throw new ArcadeNightValidationError("Au moins un jeu doit etre actif.");
  }

  return {
    slug: ARCADE_NIGHT_SLUG,
    title,
    status,
    publicStatus: publicStatus || DEFAULT_ARCADE_NIGHT_CONFIG.publicStatus,
    startAt,
    durationMinutes,
    poolCrc,
    betaParticipants,
    games,
    rewards: buildRewards(poolCrc),
    note,
  };
}

function normalizeConfig(season: SeasonRow, rows: SeasonGameRow[]): ArcadeNightConfig {
  const arcadeConfig = readArcadeConfig(season.config);
  const poolCrc = positiveNumber(season.poolCrc, DEFAULT_ARCADE_NIGHT_CONFIG.poolCrc);
  const games = DEFAULT_GAMES.map((fallback) => {
    const row = rows.find((item) => item.gameKey === fallback.key);
    const config = readGameConfig(row?.config);
    return {
      ...fallback,
      label: row?.label || config.label || fallback.label,
      enabled: typeof row?.enabled === "boolean" ? row.enabled : fallback.enabled,
      maxMatches: positiveInteger(config.maxMatches, fallback.maxMatches),
      maxMatchesPerOpponent: positiveInteger(config.maxMatchesPerOpponent, fallback.maxMatchesPerOpponent),
      minMatches: positiveInteger(config.minMatches, fallback.minMatches),
      minOpponents: positiveInteger(config.minOpponents, fallback.minOpponents),
      sortOrder: typeof row?.sortOrder === "number" ? row.sortOrder : fallback.sortOrder,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    slug: season.slug || ARCADE_NIGHT_SLUG,
    title: season.title || DEFAULT_ARCADE_NIGHT_CONFIG.title,
    status: VALID_STATUSES.includes(season.status) ? season.status : DEFAULT_ARCADE_NIGHT_CONFIG.status,
    publicStatus: readString(arcadeConfig.publicStatus, DEFAULT_ARCADE_NIGHT_CONFIG.publicStatus),
    startAt: season.startAt?.toISOString() ?? null,
    durationMinutes: positiveInteger(arcadeConfig.durationMinutes, DEFAULT_ARCADE_NIGHT_CONFIG.durationMinutes),
    poolCrc,
    betaParticipants: readParticipants(arcadeConfig.betaParticipants),
    games,
    rewards: buildRewards(poolCrc),
    note: readString(arcadeConfig.note, DEFAULT_ARCADE_NIGHT_CONFIG.note),
  };
}

function buildSeasonConfig(config: ArcadeNightConfig, existingArcadeConfig: ConfigRecord = {}): ConfigRecord {
  const arcadeNight: ConfigRecord = {
    publicStatus: config.publicStatus,
    durationMinutes: config.durationMinutes,
    betaParticipants: config.betaParticipants,
    note: config.note,
    rewards: config.rewards,
    games: config.games.map(buildGameConfig),
  };
  if (existingArcadeConfig.lastScoringSnapshot !== undefined) {
    arcadeNight.lastScoringSnapshot = existingArcadeConfig.lastScoringSnapshot;
  }

  return {
    arcadeNight,
  };
}

function buildGameConfig(game: ArcadeNightGameConfig): ConfigRecord {
  return {
    key: game.key,
    label: game.label,
    maxMatches: game.maxMatches,
    maxMatchesPerOpponent: game.maxMatchesPerOpponent,
    minMatches: game.minMatches,
    minOpponents: game.minOpponents,
  };
}

function readArcadeConfig(value: unknown): ConfigRecord {
  if (!isRecord(value)) return {};
  const nested = value.arcadeNight;
  return isRecord(nested) ? nested : {};
}

function readGameConfig(value: unknown): Partial<ArcadeNightGameConfig> {
  if (!isRecord(value)) return {};
  return {
    label: typeof value.label === "string" ? value.label : undefined,
    maxMatches: positiveInteger(value.maxMatches, 0),
    maxMatchesPerOpponent: positiveInteger(value.maxMatchesPerOpponent, 0),
    minMatches: positiveInteger(value.minMatches, 0),
    minOpponents: positiveInteger(value.minOpponents, 0),
  };
}

function readGames(value: unknown): ArcadeNightGameConfig[] {
  const rows = Array.isArray(value) ? value : DEFAULT_GAMES;
  return DEFAULT_GAMES.map((fallback) => {
    const incoming = rows.find((item) => isRecord(item) && item.key === fallback.key);
    if (!isRecord(incoming)) return fallback;
    return {
      ...fallback,
      enabled: typeof incoming.enabled === "boolean" ? incoming.enabled : fallback.enabled,
      maxMatches: clampInteger(incoming.maxMatches, 1, 30, fallback.maxMatches),
      maxMatchesPerOpponent: clampInteger(incoming.maxMatchesPerOpponent, 1, 30, fallback.maxMatchesPerOpponent),
      minMatches: clampInteger(incoming.minMatches, 1, 30, fallback.minMatches),
      minOpponents: clampInteger(incoming.minOpponents, 1, 30, fallback.minOpponents),
    };
  });
}

function readParticipants(value: unknown): string[] {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
    .slice(0, 80);
}

function readStatus(value: unknown): SeasonStatus {
  return typeof value === "string" && VALID_STATUSES.includes(value as SeasonStatus)
    ? value as SeasonStatus
    : DEFAULT_ARCADE_NIGHT_CONFIG.status;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function readNullableDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new ArcadeNightValidationError("La date est invalide.");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ArcadeNightValidationError("La date est invalide.");
  return date.toISOString();
}

function clampInteger(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed * 100) / 100));
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is ConfigRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecoverableSeasonReadError(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string };
  const message = candidate?.message ?? "";
  const cause = (error as { cause?: { message?: string; code?: string } })?.cause;
  const causeMessage = cause?.message ?? "";
  return (
    candidate?.code === "42P01"
    || cause?.code === "42P01"
    || /relation ".*season/i.test(message)
    || /relation ".*season/i.test(causeMessage)
    || /DATABASE_URL|connection string|client password must be a string|SASL/i.test(message)
    || /DATABASE_URL|connection string|client password must be a string|SASL/i.test(causeMessage)
  );
}
