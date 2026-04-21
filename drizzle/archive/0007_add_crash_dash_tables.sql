-- Crash Dash (Demurrage Dash) game tables
CREATE TABLE IF NOT EXISTS "crash_dash_tables" (
  "id" SERIAL PRIMARY KEY,
  "slug" TEXT NOT NULL UNIQUE,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "bet_options" JSONB NOT NULL DEFAULT '[5,10,50,100]',
  "recipient_address" TEXT NOT NULL,
  "primary_color" TEXT NOT NULL DEFAULT '#16A34A',
  "accent_color" TEXT NOT NULL DEFAULT '#22C55E',
  "status" TEXT NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS "crash_dash_rounds" (
  "id" SERIAL PRIMARY KEY,
  "table_id" INTEGER NOT NULL REFERENCES "crash_dash_tables"("id"),
  "player_address" TEXT NOT NULL,
  "transaction_hash" TEXT NOT NULL UNIQUE,
  "bet_crc" INTEGER NOT NULL,
  "player_token" TEXT,
  "game_state" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'playing',
  "outcome" TEXT,
  "crash_point" REAL,
  "cashout_multiplier" REAL,
  "final_multiplier" REAL,
  "payout_crc" REAL,
  "payout_status" TEXT NOT NULL DEFAULT 'pending',
  "payout_tx_hash" TEXT,
  "error_message" TEXT,
  "created_at" TIMESTAMP DEFAULT NOW() NOT NULL,
  "updated_at" TIMESTAMP DEFAULT NOW() NOT NULL
);
