-- Migration: Add Keno game tables
-- Keno: pick numbers, random draw, RTP ~99%

CREATE TABLE IF NOT EXISTS keno_tables (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  bet_options JSONB NOT NULL DEFAULT '[1, 5, 10, 25]',
  recipient_address TEXT NOT NULL,
  primary_color TEXT NOT NULL DEFAULT '#6366F1',
  accent_color TEXT NOT NULL DEFAULT '#818CF8',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS keno_rounds (
  id SERIAL PRIMARY KEY,
  table_id INTEGER NOT NULL REFERENCES keno_tables(id),
  player_address TEXT NOT NULL,
  transaction_hash TEXT NOT NULL UNIQUE,
  bet_crc INTEGER NOT NULL,
  pick_count INTEGER NOT NULL,
  player_token TEXT,
  game_state JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'playing',
  outcome TEXT,
  hits INTEGER NOT NULL DEFAULT 0,
  final_multiplier REAL,
  payout_crc REAL,
  payout_status TEXT NOT NULL DEFAULT 'pending',
  payout_tx_hash TEXT,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Insert classic table
INSERT INTO keno_tables (slug, title, description, recipient_address, bet_options)
VALUES (
  'classic',
  'Keno Classic',
  'Choisissez vos numeros, tentez votre chance.',
  '0x960A0784640fD6581D221A56df1c60b65b5ebB6f',
  '[1, 5, 10, 25]'
) ON CONFLICT (slug) DO NOTHING;
