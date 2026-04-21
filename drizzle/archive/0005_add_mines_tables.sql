-- Mines game tables
CREATE TABLE IF NOT EXISTS "mines_tables" (
  "id" SERIAL PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "bet_options" JSONB NOT NULL DEFAULT '[1,5,10,25]',
  "mine_options" JSONB NOT NULL DEFAULT '[1,3,5,10,24]',
  "recipient_address" TEXT NOT NULL,
  "primary_color" TEXT NOT NULL DEFAULT '#DC2626',
  "accent_color" TEXT NOT NULL DEFAULT '#EF4444',
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "mines_rounds" (
  "id" SERIAL PRIMARY KEY,
  "table_id" INTEGER NOT NULL REFERENCES "mines_tables"("id"),
  "player_address" TEXT NOT NULL,
  "transaction_hash" TEXT NOT NULL UNIQUE,
  "bet_crc" INTEGER NOT NULL,
  "mine_count" INTEGER NOT NULL,
  "player_token" TEXT,
  "game_state" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'playing',
  "outcome" TEXT,
  "gems_revealed" INTEGER NOT NULL DEFAULT 0,
  "final_multiplier" REAL,
  "payout_crc" REAL,
  "payout_status" TEXT NOT NULL DEFAULT 'pending',
  "payout_tx_hash" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);
