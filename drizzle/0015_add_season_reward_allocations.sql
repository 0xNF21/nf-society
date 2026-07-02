CREATE TABLE IF NOT EXISTS "season_reward_allocations" (
  "id" serial PRIMARY KEY NOT NULL,
  "season_slug" text NOT NULL,
  "address" text NOT NULL,
  "reward_rank" integer NOT NULL,
  "amount_crc" real NOT NULL,
  "status" text DEFAULT 'claimable' NOT NULL,
  "payout_id" integer,
  "payout_tx_hash" text,
  "claimed_at" timestamp,
  "void_reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "season_reward_allocations_unique_player_idx"
  ON "season_reward_allocations" ("season_slug", "address");
CREATE UNIQUE INDEX IF NOT EXISTS "season_reward_allocations_unique_rank_idx"
  ON "season_reward_allocations" ("season_slug", "reward_rank");
CREATE INDEX IF NOT EXISTS "season_reward_allocations_season_idx"
  ON "season_reward_allocations" ("season_slug");
CREATE INDEX IF NOT EXISTS "season_reward_allocations_address_idx"
  ON "season_reward_allocations" ("address");
CREATE INDEX IF NOT EXISTS "season_reward_allocations_status_idx"
  ON "season_reward_allocations" ("status");
