-- Dice game tables
CREATE TABLE IF NOT EXISTS "dice_tables" (
  "id" SERIAL PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "bet_options" JSONB NOT NULL DEFAULT '[1,5,10,25]',
  "recipient_address" TEXT NOT NULL,
  "primary_color" TEXT NOT NULL DEFAULT '#F59E0B',
  "accent_color" TEXT NOT NULL DEFAULT '#D97706',
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "dice_rounds" (
  "id" SERIAL PRIMARY KEY,
  "table_id" INTEGER NOT NULL REFERENCES "dice_tables"("id"),
  "player_address" TEXT NOT NULL,
  "transaction_hash" TEXT NOT NULL UNIQUE,
  "bet_crc" INTEGER NOT NULL,
  "player_token" TEXT,
  "game_state" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'playing',
  "target" REAL,
  "direction" TEXT,
  "result" REAL,
  "outcome" TEXT,
  "final_multiplier" REAL,
  "payout_crc" REAL,
  "payout_status" TEXT NOT NULL DEFAULT 'pending',
  "payout_tx_hash" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);
