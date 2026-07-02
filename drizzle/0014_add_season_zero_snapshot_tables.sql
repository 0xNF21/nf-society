CREATE TABLE IF NOT EXISTS "seasons" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" text NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "start_at" timestamp,
  "end_at" timestamp,
  "review_ends_at" timestamp,
  "pool_crc" real DEFAULT 0 NOT NULL,
  "config" jsonb,
  "snapshot_at" timestamp,
  "finalized_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "seasons_slug_idx" ON "seasons" ("slug");
CREATE INDEX IF NOT EXISTS "seasons_status_idx" ON "seasons" ("status");
CREATE INDEX IF NOT EXISTS "seasons_window_idx" ON "seasons" ("start_at", "end_at");

CREATE TABLE IF NOT EXISTS "season_games" (
  "id" serial PRIMARY KEY NOT NULL,
  "season_slug" text NOT NULL,
  "game_key" text NOT NULL,
  "label" text NOT NULL,
  "enabled" boolean DEFAULT true NOT NULL,
  "visible_in_lobby" boolean DEFAULT true NOT NULL,
  "counts_for_leaderboard" boolean DEFAULT true NOT NULL,
  "points_win" integer DEFAULT 10 NOT NULL,
  "points_loss" integer DEFAULT 2 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "config" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "season_games_unique_idx"
  ON "season_games" ("season_slug", "game_key");
CREATE INDEX IF NOT EXISTS "season_games_season_idx" ON "season_games" ("season_slug");
CREATE INDEX IF NOT EXISTS "season_games_enabled_idx" ON "season_games" ("enabled");

CREATE TABLE IF NOT EXISTS "season_match_results" (
  "id" serial PRIMARY KEY NOT NULL,
  "season_slug" text NOT NULL,
  "game_key" text NOT NULL,
  "game_slug" text NOT NULL,
  "player_address" text NOT NULL,
  "opponent_address" text NOT NULL,
  "result" text NOT NULL,
  "points" integer NOT NULL,
  "counted" boolean DEFAULT true NOT NULL,
  "excluded_reason" text,
  "match_updated_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "season_match_results_unique_player_idx"
  ON "season_match_results" ("season_slug", "game_key", "game_slug", "player_address");
CREATE INDEX IF NOT EXISTS "season_match_results_season_idx" ON "season_match_results" ("season_slug");
CREATE INDEX IF NOT EXISTS "season_match_results_player_idx" ON "season_match_results" ("player_address");
CREATE INDEX IF NOT EXISTS "season_match_results_game_idx" ON "season_match_results" ("game_key");

CREATE TABLE IF NOT EXISTS "season_scores" (
  "id" serial PRIMARY KEY NOT NULL,
  "season_slug" text NOT NULL,
  "address" text NOT NULL,
  "rank" integer NOT NULL,
  "points" integer NOT NULL,
  "wins" integer NOT NULL,
  "losses" integer NOT NULL,
  "matches" integer NOT NULL,
  "unique_opponents" integer NOT NULL,
  "win_rate" integer NOT NULL,
  "by_game" jsonb NOT NULL,
  "eligible_for_rewards" boolean DEFAULT false NOT NULL,
  "reward_rank" integer,
  "projected_reward_crc" real,
  "last_score_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "season_scores_unique_player_idx"
  ON "season_scores" ("season_slug", "address");
CREATE UNIQUE INDEX IF NOT EXISTS "season_scores_unique_rank_idx"
  ON "season_scores" ("season_slug", "rank");
CREATE INDEX IF NOT EXISTS "season_scores_season_idx" ON "season_scores" ("season_slug");
CREATE INDEX IF NOT EXISTS "season_scores_address_idx" ON "season_scores" ("address");
