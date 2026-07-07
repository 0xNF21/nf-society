import { and, eq, gte, lte } from "drizzle-orm";

import {
  ARCADE_NIGHT_SLUG,
  getArcadeNightPublicState,
  type ArcadeNightConfig,
  type ArcadeNightGameConfig,
} from "@/lib/arcade-night";
import { db } from "@/lib/db";
import {
  adminAuditLogs,
  damesGames,
  memoryGames,
  seasons,
} from "@/lib/db/schema";

type GameKey = "memory" | "dames";
type MatchResult = "win" | "draw" | "loss";

type CandidateRow = {
  gameKey: GameKey;
  gameSlug: string;
  playerAddress: string;
  opponentAddress: string;
  result: MatchResult;
  points: number;
  matchStartedAt: string;
  matchUpdatedAt: string;
};

export type ArcadeNightScoredMatch = CandidateRow & {
  counted: boolean;
  excludedReason: string | null;
};

export type ArcadeNightLeaderboardEntry = {
  rank: number;
  address: string;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  matches: number;
  rawMatches: number;
  uniqueOpponents: number;
  winRate: number;
  eligibleForRewards: boolean;
  eligibilityReasons: string[];
  finalScoreAt: string | null;
};

export type ArcadeNightGameScore = {
  gameKey: GameKey;
  label: string;
  enabled: boolean;
  scannedMatches: number;
  validMatches: number;
  countedRows: number;
  rules: {
    maxMatches: number;
    maxMatchesPerOpponent: number;
    minMatches: number;
    minOpponents: number;
  };
  leaderboard: ArcadeNightLeaderboardEntry[];
  matches: ArcadeNightScoredMatch[];
};

export type ArcadeNightProjectedReward = {
  key: string;
  label: string;
  gameKey: GameKey | "helper";
  amountCrc: number;
  address: string | null;
  sourceRank: number | null;
  status: "projected" | "manual" | "unassigned";
};

export type ArcadeNightScoringSnapshot = {
  version: 1;
  seasonSlug: string;
  generatedAt: string;
  status: "ready" | "missing_window" | "tables_unavailable";
  scoringRule: "created_and_finished_within_window";
  window: {
    startAt: string | null;
    endAt: string | null;
    durationMinutes: number;
  };
  warnings: string[];
  games: ArcadeNightGameScore[];
  projectedRewards: ArcadeNightProjectedReward[];
  summary: {
    totalScannedMatches: number;
    totalValidMatches: number;
    totalCountedRows: number;
    eligibleWallets: number;
  };
};

export class ArcadeNightScoringUnavailableError extends Error {
  constructor(message = "Arcade Night scoring is unavailable.") {
    super(message);
    this.name = "ArcadeNightScoringUnavailableError";
  }
}

type AuditInput = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export async function computeArcadeNightScoringSnapshot(): Promise<ArcadeNightScoringSnapshot> {
  const state = await getArcadeNightPublicState();
  const config = state.config;
  const warnings: string[] = [];

  if (!state.tableReady) {
    return emptySnapshot(config, "tables_unavailable", [
      "Les tables Season ou la connexion DB ne sont pas disponibles.",
    ]);
  }

  if (!config.startAt) {
    return emptySnapshot(config, "missing_window", [
      "Configure une date de debut dans l'onglet Arcade Night avant de calculer le scoring.",
    ]);
  }

  const startAt = new Date(config.startAt);
  const endAt = new Date(startAt.getTime() + config.durationMinutes * 60_000);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return emptySnapshot(config, "missing_window", [
      "La fenetre Arcade Night est invalide.",
    ]);
  }

  const games: ArcadeNightGameScore[] = [];

  for (const gameConfig of config.games) {
    if (!gameConfig.enabled) {
      games.push(emptyGameScore(gameConfig));
      continue;
    }

    const raw = gameConfig.key === "memory"
      ? await loadMemoryCandidates(startAt, endAt)
      : await loadDamesCandidates(startAt, endAt);
    if (raw.invalidRows > 0) {
      warnings.push(`${gameConfig.label}: ${raw.invalidRows} match(s) ignores car incomplets ou invalides.`);
    }
    games.push(scoreGame(gameConfig, raw.candidates, raw.scannedMatches));
  }

  const projectedRewards = projectRewards(config, games, warnings);
  const eligibleWallets = new Set<string>();
  const summaryBase = games.reduce((acc, game) => {
    for (const entry of game.leaderboard) {
      if (entry.eligibleForRewards) eligibleWallets.add(entry.address);
    }
    return {
      totalScannedMatches: acc.totalScannedMatches + game.scannedMatches,
      totalValidMatches: acc.totalValidMatches + game.validMatches,
      totalCountedRows: acc.totalCountedRows + game.countedRows,
    };
  }, {
    totalScannedMatches: 0,
    totalValidMatches: 0,
    totalCountedRows: 0,
  });
  const summary = {
    ...summaryBase,
    eligibleWallets: eligibleWallets.size,
  };

  return {
    version: 1,
    seasonSlug: ARCADE_NIGHT_SLUG,
    generatedAt: new Date().toISOString(),
    status: "ready",
    scoringRule: "created_and_finished_within_window",
    window: {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      durationMinutes: config.durationMinutes,
    },
    warnings,
    games,
    projectedRewards,
    summary,
  };
}

export async function saveArcadeNightScoringSnapshot(audit?: AuditInput): Promise<ArcadeNightScoringSnapshot> {
  const snapshot = await computeArcadeNightScoringSnapshot();
  if (snapshot.status !== "ready") return snapshot;

  try {
    const [season] = await db
      .select()
      .from(seasons)
      .where(eq(seasons.slug, ARCADE_NIGHT_SLUG))
      .limit(1);
    if (!season) throw new ArcadeNightScoringUnavailableError("Arcade Night season row not found.");

    const config = mergeSnapshotIntoConfig(season.config, snapshot);
    const now = new Date();

    await db.transaction(async (tx) => {
      await tx
        .update(seasons)
        .set({
          config,
          snapshotAt: now,
          updatedAt: now,
        })
        .where(eq(seasons.slug, ARCADE_NIGHT_SLUG));

      await tx.insert(adminAuditLogs).values({
        action: "arcade_night_scoring_snapshot",
        seasonSlug: ARCADE_NIGHT_SLUG,
        actor: "admin",
        ipAddress: audit?.ipAddress ?? null,
        userAgent: audit?.userAgent ?? null,
        summary: `Arcade Night scoring snapshot: ${snapshot.summary.totalValidMatches} valid match(es), ${snapshot.summary.eligibleWallets} eligible wallet(s)`,
        metadata: {
          generatedAt: snapshot.generatedAt,
          summary: snapshot.summary,
          projectedRewards: snapshot.projectedRewards,
          warnings: snapshot.warnings,
        },
      });
    });
  } catch (error) {
    if (isRecoverableSeasonError(error)) {
      throw new ArcadeNightScoringUnavailableError("Season tables are not available.");
    }
    throw error;
  }

  return snapshot;
}

async function loadMemoryCandidates(startAt: Date, endAt: Date) {
  const rows = await db
    .select()
    .from(memoryGames)
    .where(and(
      eq(memoryGames.status, "finished"),
      gte(memoryGames.createdAt, startAt),
      lte(memoryGames.updatedAt, endAt),
    ));

  const candidates: CandidateRow[] = [];
  let invalidRows = 0;

  for (const row of rows) {
    const p1 = normalizeAddress(row.player1Address);
    const p2 = normalizeAddress(row.player2Address);
    if (!p1 || !p2 || p1 === p2) {
      invalidRows += 1;
      continue;
    }

    const winner = normalizeAddress(row.winnerAddress);
    if (row.result === "draw") {
      candidates.push(candidate("memory", row.slug, p1, p2, "draw", row.createdAt, row.updatedAt));
      candidates.push(candidate("memory", row.slug, p2, p1, "draw", row.createdAt, row.updatedAt));
      continue;
    }

    if (!winner) {
      invalidRows += 1;
      continue;
    }

    if (row.result === "player1" && winner === p1) {
      candidates.push(candidate("memory", row.slug, p1, p2, "win", row.createdAt, row.updatedAt));
      candidates.push(candidate("memory", row.slug, p2, p1, "loss", row.createdAt, row.updatedAt));
    } else if (row.result === "player2" && winner === p2) {
      candidates.push(candidate("memory", row.slug, p2, p1, "win", row.createdAt, row.updatedAt));
      candidates.push(candidate("memory", row.slug, p1, p2, "loss", row.createdAt, row.updatedAt));
    } else {
      invalidRows += 1;
    }
  }

  return { candidates, invalidRows, scannedMatches: rows.length };
}

async function loadDamesCandidates(startAt: Date, endAt: Date) {
  const rows = await db
    .select()
    .from(damesGames)
    .where(and(
      eq(damesGames.status, "finished"),
      gte(damesGames.createdAt, startAt),
      lte(damesGames.updatedAt, endAt),
    ));

  const candidates: CandidateRow[] = [];
  let invalidRows = 0;

  for (const row of rows) {
    const p1 = normalizeAddress(row.player1Address);
    const p2 = normalizeAddress(row.player2Address);
    const winner = normalizeAddress(row.winnerAddress);
    if (!p1 || !p2 || p1 === p2 || !winner) {
      invalidRows += 1;
      continue;
    }

    if (winner === p1) {
      candidates.push(candidate("dames", row.slug, p1, p2, "win", row.createdAt, row.updatedAt));
      candidates.push(candidate("dames", row.slug, p2, p1, "loss", row.createdAt, row.updatedAt));
    } else if (winner === p2) {
      candidates.push(candidate("dames", row.slug, p2, p1, "win", row.createdAt, row.updatedAt));
      candidates.push(candidate("dames", row.slug, p1, p2, "loss", row.createdAt, row.updatedAt));
    } else {
      invalidRows += 1;
    }
  }

  return { candidates, invalidRows, scannedMatches: rows.length };
}

function candidate(
  gameKey: GameKey,
  gameSlug: string,
  playerAddress: string,
  opponentAddress: string,
  result: MatchResult,
  matchStartedAt: Date,
  matchUpdatedAt: Date,
): CandidateRow {
  return {
    gameKey,
    gameSlug,
    playerAddress,
    opponentAddress,
    result,
    points: pointsForResult(result),
    matchStartedAt: matchStartedAt.toISOString(),
    matchUpdatedAt: matchUpdatedAt.toISOString(),
  };
}

function scoreGame(
  gameConfig: ArcadeNightGameConfig,
  candidates: CandidateRow[],
  scannedMatches: number,
): ArcadeNightGameScore {
  const sorted = [...candidates].sort((a, b) => (
    a.matchUpdatedAt.localeCompare(b.matchUpdatedAt) || a.gameSlug.localeCompare(b.gameSlug) || a.playerAddress.localeCompare(b.playerAddress)
  ));
  const countedByPlayer = new Map<string, number>();
  const countedByOpponent = new Map<string, number>();

  const matches: ArcadeNightScoredMatch[] = sorted.map((row) => {
    const playerCount = countedByPlayer.get(row.playerAddress) ?? 0;
    const pairKey = `${row.playerAddress}:${row.opponentAddress}`;
    const opponentCount = countedByOpponent.get(pairKey) ?? 0;

    if (playerCount >= gameConfig.maxMatches) {
      return { ...row, counted: false, excludedReason: "max_matches" };
    }
    if (opponentCount >= gameConfig.maxMatchesPerOpponent) {
      return { ...row, counted: false, excludedReason: "max_vs_same_wallet" };
    }

    countedByPlayer.set(row.playerAddress, playerCount + 1);
    countedByOpponent.set(pairKey, opponentCount + 1);
    return { ...row, counted: true, excludedReason: null };
  });

  const leaderboard = buildLeaderboard(gameConfig, matches);

  return {
    gameKey: gameConfig.key,
    label: gameConfig.label,
    enabled: gameConfig.enabled,
    scannedMatches,
    validMatches: candidates.length / 2,
    countedRows: matches.filter((row) => row.counted).length,
    rules: {
      maxMatches: gameConfig.maxMatches,
      maxMatchesPerOpponent: gameConfig.maxMatchesPerOpponent,
      minMatches: gameConfig.minMatches,
      minOpponents: gameConfig.minOpponents,
    },
    leaderboard,
    matches,
  };
}

function buildLeaderboard(
  gameConfig: ArcadeNightGameConfig,
  matches: ArcadeNightScoredMatch[],
): ArcadeNightLeaderboardEntry[] {
  const byPlayer = new Map<string, {
    address: string;
    points: number;
    wins: number;
    draws: number;
    losses: number;
    matches: number;
    rawMatches: number;
    opponents: Set<string>;
    finalScoreAt: string | null;
  }>();

  for (const row of matches) {
    const current = byPlayer.get(row.playerAddress) ?? {
      address: row.playerAddress,
      points: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      matches: 0,
      rawMatches: 0,
      opponents: new Set<string>(),
      finalScoreAt: null,
    };

    current.rawMatches += 1;
    if (row.counted) {
      current.points += row.points;
      current.matches += 1;
      current.opponents.add(row.opponentAddress);
      current.finalScoreAt = row.matchUpdatedAt;
      if (row.result === "win") current.wins += 1;
      if (row.result === "draw") current.draws += 1;
      if (row.result === "loss") current.losses += 1;
    }
    byPlayer.set(row.playerAddress, current);
  }

  return [...byPlayer.values()]
    .map((row) => {
      const uniqueOpponents = row.opponents.size;
      const winRate = row.matches > 0 ? Math.round((row.wins / row.matches) * 1000) : 0;
      const eligibilityReasons: string[] = [];
      if (row.matches < gameConfig.minMatches) {
        eligibilityReasons.push(`min_matches_${gameConfig.minMatches}`);
      }
      if (uniqueOpponents < gameConfig.minOpponents) {
        eligibilityReasons.push(`min_opponents_${gameConfig.minOpponents}`);
      }
      return {
        rank: 0,
        address: row.address,
        points: row.points,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        matches: row.matches,
        rawMatches: row.rawMatches,
        uniqueOpponents,
        winRate,
        eligibleForRewards: eligibilityReasons.length === 0,
        eligibilityReasons,
        finalScoreAt: row.finalScoreAt,
      };
    })
    .sort(compareLeaderboardEntries)
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

function compareLeaderboardEntries(a: ArcadeNightLeaderboardEntry, b: ArcadeNightLeaderboardEntry): number {
  return (
    b.points - a.points
    || b.uniqueOpponents - a.uniqueOpponents
    || b.wins - a.wins
    || b.winRate - a.winRate
    || b.matches - a.matches
    || (a.finalScoreAt ?? "9999").localeCompare(b.finalScoreAt ?? "9999")
    || a.address.localeCompare(b.address)
  );
}

function projectRewards(
  config: ArcadeNightConfig,
  games: ArcadeNightGameScore[],
  warnings: string[],
): ArcadeNightProjectedReward[] {
  const usedAddresses = new Set<string>();
  const assignedByAddress = new Map<string, ArcadeNightProjectedReward[]>();
  const byGame = new Map(games.map((game) => [game.gameKey, game]));
  const slotOrder: Array<{ key: string; gameKey: GameKey; rank: number; label: string }> = [
    { key: "memory1", gameKey: "memory", rank: 1, label: "Memory #1" },
    { key: "dames1", gameKey: "dames", rank: 1, label: "Dames #1" },
    { key: "memory2", gameKey: "memory", rank: 2, label: "Memory #2" },
    { key: "dames2", gameKey: "dames", rank: 2, label: "Dames #2" },
  ];

  const rewards: ArcadeNightProjectedReward[] = slotOrder.map((slot) => {
    const reward = config.rewards.find((item) => item.key === slot.key);
    const amountCrc = reward?.amountCrc ?? 0;
    const game = byGame.get(slot.gameKey);
    const eligible = game?.leaderboard.filter((entry) => entry.eligibleForRewards) ?? [];
    for (const skipped of eligible.filter((entry) => usedAddresses.has(entry.address))) {
      const previousRewards = assignedByAddress.get(skipped.address) ?? [];
      const equalReward = previousRewards.find((previous) => previous.amountCrc === amountCrc);
      if (equalReward) {
        warnings.push(`${slot.label}: ${skipped.address} est aussi eligible pour une reward egale a ${equalReward.label}; decision founder requise.`);
      }
    }
    const winner = eligible.find((entry) => !usedAddresses.has(entry.address)) ?? null;
    if (winner) usedAddresses.add(winner.address);
    if (!winner && eligible.length > 0) {
      warnings.push(`${slot.label}: aucun wallet libre apres regle anti-concentration.`);
    }
    const projected = {
      key: slot.key,
      label: slot.label,
      gameKey: slot.gameKey,
      amountCrc,
      address: winner?.address ?? null,
      sourceRank: winner?.rank ?? null,
      status: winner ? "projected" as const : "unassigned" as const,
    };
    if (winner) {
      assignedByAddress.set(winner.address, [...(assignedByAddress.get(winner.address) ?? []), projected]);
    }
    return projected;
  });

  const helper = config.rewards.find((item) => item.key === "helper");
  rewards.push({
    key: "helper",
    label: helper?.label ?? "Beta helper / bug report",
    gameKey: "helper",
    amountCrc: helper?.amountCrc ?? 0,
    address: null,
    sourceRank: null,
    status: "manual",
  });

  return rewards;
}

function emptySnapshot(
  config: ArcadeNightConfig,
  status: ArcadeNightScoringSnapshot["status"],
  warnings: string[],
): ArcadeNightScoringSnapshot {
  return {
    version: 1,
    seasonSlug: ARCADE_NIGHT_SLUG,
    generatedAt: new Date().toISOString(),
    status,
    scoringRule: "created_and_finished_within_window",
    window: {
      startAt: config.startAt,
      endAt: config.startAt
        ? new Date(new Date(config.startAt).getTime() + config.durationMinutes * 60_000).toISOString()
        : null,
      durationMinutes: config.durationMinutes,
    },
    warnings,
    games: config.games.map(emptyGameScore),
    projectedRewards: config.rewards.map((reward) => ({
      key: reward.key,
      label: reward.label,
      gameKey: reward.key.startsWith("memory") ? "memory" : reward.key.startsWith("dames") ? "dames" : "helper",
      amountCrc: reward.amountCrc,
      address: null,
      sourceRank: null,
      status: reward.key === "helper" ? "manual" : "unassigned",
    })),
    summary: {
      totalScannedMatches: 0,
      totalValidMatches: 0,
      totalCountedRows: 0,
      eligibleWallets: 0,
    },
  };
}

function emptyGameScore(game: ArcadeNightGameConfig): ArcadeNightGameScore {
  return {
    gameKey: game.key,
    label: game.label,
    enabled: game.enabled,
    scannedMatches: 0,
    validMatches: 0,
    countedRows: 0,
    rules: {
      maxMatches: game.maxMatches,
      maxMatchesPerOpponent: game.maxMatchesPerOpponent,
      minMatches: game.minMatches,
      minOpponents: game.minOpponents,
    },
    leaderboard: [],
    matches: [],
  };
}

function mergeSnapshotIntoConfig(
  value: Record<string, unknown> | null,
  snapshot: ArcadeNightScoringSnapshot,
): Record<string, unknown> {
  const root = isRecord(value) ? { ...value } : {};
  const arcadeNight = isRecord(root.arcadeNight) ? { ...root.arcadeNight } : {};
  arcadeNight.lastScoringSnapshot = snapshot;
  root.arcadeNight = arcadeNight;
  return root;
}

function pointsForResult(result: MatchResult): number {
  if (result === "win") return 10;
  if (result === "draw") return 5;
  return 2;
}

function normalizeAddress(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecoverableSeasonError(error: unknown): boolean {
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
