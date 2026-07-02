import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type SeasonStatus = "draft" | "scheduled" | "active" | "review" | "finalized";

export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  status: text("status").notNull().$type<SeasonStatus>().default("draft"),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  reviewEndsAt: timestamp("review_ends_at"),
  poolCrc: real("pool_crc").notNull().default(0),
  config: jsonb("config").$type<Record<string, unknown> | null>(),
  snapshotAt: timestamp("snapshot_at"),
  finalizedAt: timestamp("finalized_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  slugIdx: uniqueIndex("seasons_slug_idx").on(table.slug),
  statusIdx: index("seasons_status_idx").on(table.status),
  windowIdx: index("seasons_window_idx").on(table.startAt, table.endAt),
}));

export const seasonGames = pgTable("season_games", {
  id: serial("id").primaryKey(),
  seasonSlug: text("season_slug").notNull(),
  gameKey: text("game_key").notNull(),
  label: text("label").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  visibleInLobby: boolean("visible_in_lobby").notNull().default(true),
  countsForLeaderboard: boolean("counts_for_leaderboard").notNull().default(true),
  pointsWin: integer("points_win").notNull().default(10),
  pointsDraw: integer("points_draw").notNull().default(5),
  pointsLoss: integer("points_loss").notNull().default(2),
  sortOrder: integer("sort_order").notNull().default(0),
  config: jsonb("config").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueSeasonGame: uniqueIndex("season_games_unique_idx").on(table.seasonSlug, table.gameKey),
  seasonIdx: index("season_games_season_idx").on(table.seasonSlug),
  enabledIdx: index("season_games_enabled_idx").on(table.enabled),
}));

export const seasonMatchResults = pgTable("season_match_results", {
  id: serial("id").primaryKey(),
  seasonSlug: text("season_slug").notNull(),
  gameKey: text("game_key").notNull(),
  gameSlug: text("game_slug").notNull(),
  playerAddress: text("player_address").notNull(),
  opponentAddress: text("opponent_address").notNull(),
  result: text("result").notNull(), // win | draw | loss
  points: integer("points").notNull(),
  counted: boolean("counted").notNull().default(true),
  excludedReason: text("excluded_reason"),
  matchUpdatedAt: timestamp("match_updated_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniquePlayerResult: uniqueIndex("season_match_results_unique_player_idx")
    .on(table.seasonSlug, table.gameKey, table.gameSlug, table.playerAddress),
  seasonIdx: index("season_match_results_season_idx").on(table.seasonSlug),
  playerIdx: index("season_match_results_player_idx").on(table.playerAddress),
  gameIdx: index("season_match_results_game_idx").on(table.gameKey),
}));

export const seasonGameLinks = pgTable("season_game_links", {
  id: serial("id").primaryKey(),
  seasonSlug: text("season_slug").notNull(),
  gameKey: text("game_key").notNull(),
  gameSlug: text("game_slug").notNull(),
  source: text("source").notNull().default("lobby"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniqueGame: uniqueIndex("season_game_links_unique_game_idx").on(table.gameKey, table.gameSlug),
  seasonIdx: index("season_game_links_season_idx").on(table.seasonSlug),
  gameIdx: index("season_game_links_game_idx").on(table.gameKey),
}));

export const seasonScores = pgTable("season_scores", {
  id: serial("id").primaryKey(),
  seasonSlug: text("season_slug").notNull(),
  address: text("address").notNull(),
  rank: integer("rank").notNull(),
  points: integer("points").notNull(),
  wins: integer("wins").notNull(),
  draws: integer("draws").notNull().default(0),
  losses: integer("losses").notNull(),
  matches: integer("matches").notNull(),
  uniqueOpponents: integer("unique_opponents").notNull(),
  winRate: integer("win_rate").notNull(),
  byGame: jsonb("by_game").$type<Record<string, unknown>>().notNull(),
  eligibleForRewards: boolean("eligible_for_rewards").notNull().default(false),
  rewardRank: integer("reward_rank"),
  projectedRewardCrc: real("projected_reward_crc"),
  lastScoreAt: timestamp("last_score_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  uniquePlayerScore: uniqueIndex("season_scores_unique_player_idx")
    .on(table.seasonSlug, table.address),
  uniqueRank: uniqueIndex("season_scores_unique_rank_idx").on(table.seasonSlug, table.rank),
  seasonIdx: index("season_scores_season_idx").on(table.seasonSlug),
  addressIdx: index("season_scores_address_idx").on(table.address),
}));

export type SeasonRewardAllocationStatus = "claimable" | "claiming" | "claimed" | "void";

export const seasonRewardAllocations = pgTable("season_reward_allocations", {
  id: serial("id").primaryKey(),
  seasonSlug: text("season_slug").notNull(),
  address: text("address").notNull(),
  rewardRank: integer("reward_rank").notNull(),
  amountCrc: real("amount_crc").notNull(),
  status: text("status").notNull().$type<SeasonRewardAllocationStatus>().default("claimable"),
  payoutId: integer("payout_id"),
  payoutTxHash: text("payout_tx_hash"),
  claimedAt: timestamp("claimed_at"),
  voidReason: text("void_reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (table) => ({
  uniqueRewardPerPlayer: uniqueIndex("season_reward_allocations_unique_player_idx")
    .on(table.seasonSlug, table.address),
  uniqueRewardRank: uniqueIndex("season_reward_allocations_unique_rank_idx")
    .on(table.seasonSlug, table.rewardRank),
  seasonIdx: index("season_reward_allocations_season_idx").on(table.seasonSlug),
  addressIdx: index("season_reward_allocations_address_idx").on(table.address),
  statusIdx: index("season_reward_allocations_status_idx").on(table.status),
}));

export const adminAuditLogs = pgTable("admin_audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  seasonSlug: text("season_slug"),
  actor: text("actor").notNull().default("admin"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  summary: text("summary").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (table) => ({
  actionIdx: index("admin_audit_logs_action_idx").on(table.action),
  seasonIdx: index("admin_audit_logs_season_idx").on(table.seasonSlug),
  createdAtIdx: index("admin_audit_logs_created_at_idx").on(table.createdAt),
}));

export type SeasonRow = typeof seasons.$inferSelect;
export type NewSeason = typeof seasons.$inferInsert;
export type SeasonGameRow = typeof seasonGames.$inferSelect;
export type NewSeasonGame = typeof seasonGames.$inferInsert;
export type SeasonMatchResultRow = typeof seasonMatchResults.$inferSelect;
export type NewSeasonMatchResult = typeof seasonMatchResults.$inferInsert;
export type SeasonGameLinkRow = typeof seasonGameLinks.$inferSelect;
export type NewSeasonGameLink = typeof seasonGameLinks.$inferInsert;
export type SeasonScoreRow = typeof seasonScores.$inferSelect;
export type NewSeasonScore = typeof seasonScores.$inferInsert;
export type SeasonRewardAllocationRow = typeof seasonRewardAllocations.$inferSelect;
export type NewSeasonRewardAllocation = typeof seasonRewardAllocations.$inferInsert;
export type AdminAuditLogRow = typeof adminAuditLogs.$inferSelect;
export type NewAdminAuditLog = typeof adminAuditLogs.$inferInsert;
