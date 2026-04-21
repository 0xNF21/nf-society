-- Hi-Lo chance game tables
CREATE TABLE IF NOT EXISTS "hilo_tables" (
  "id" serial PRIMARY KEY NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "title" text NOT NULL,
  "description" text,
  "bet_options" jsonb NOT NULL DEFAULT '[1, 5, 10, 25]',
  "recipient_address" text NOT NULL,
  "primary_color" text NOT NULL DEFAULT '#7C3AED',
  "accent_color" text NOT NULL DEFAULT '#8B5CF6',
  "status" text NOT NULL DEFAULT 'active',
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "hilo_rounds" (
  "id" serial PRIMARY KEY NOT NULL,
  "table_id" integer NOT NULL REFERENCES "hilo_tables"("id"),
  "player_address" text NOT NULL,
  "transaction_hash" text NOT NULL UNIQUE,
  "bet_crc" integer NOT NULL,
  "player_token" text,
  "game_state" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'playing',
  "outcome" text,
  "streak" integer NOT NULL DEFAULT 0,
  "final_multiplier" real,
  "payout_crc" real,
  "payout_status" text NOT NULL DEFAULT 'pending',
  "payout_tx_hash" text,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
