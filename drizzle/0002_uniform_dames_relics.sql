-- Migration: Uniformize dames_games and relics_games to serial id + slug pattern
-- Aligns with morpion_games / memory_games architecture
-- Renames: winner -> winner_address, payout_tx -> payout_tx_hash

-- ============================================================
-- 1. DROP old tables (no production data to preserve)
-- ============================================================
DROP TABLE IF EXISTS dames_games CASCADE;
DROP TABLE IF EXISTS relics_games CASCADE;

-- ============================================================
-- 2. CREATE dames_games (serial id + slug, uniform columns)
-- ============================================================
CREATE TABLE dames_games (
  id                SERIAL PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'waiting_p1',
  bet_crc           INTEGER NOT NULL,
  recipient_address TEXT NOT NULL,
  commission_pct    INTEGER NOT NULL DEFAULT 5,
  player1_address   TEXT,
  player2_address   TEXT,
  player1_tx_hash   TEXT,
  player2_tx_hash   TEXT,
  game_state        JSONB,
  winner_address    TEXT,
  payout_status     TEXT NOT NULL DEFAULT 'pending',
  payout_tx_hash    TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. CREATE relics_games (serial id + slug, uniform columns)
-- ============================================================
CREATE TABLE relics_games (
  id                SERIAL PRIMARY KEY,
  slug              TEXT NOT NULL UNIQUE,
  status            TEXT NOT NULL DEFAULT 'waiting_p1',
  bet_crc           INTEGER NOT NULL,
  recipient_address TEXT NOT NULL,
  commission_pct    INTEGER NOT NULL DEFAULT 5,
  player1_address   TEXT,
  player2_address   TEXT,
  player1_tx_hash   TEXT,
  player2_tx_hash   TEXT,
  grid1             JSONB,
  grid2             JSONB,
  ready1            INTEGER NOT NULL DEFAULT 0,
  ready2            INTEGER NOT NULL DEFAULT 0,
  current_turn      TEXT,
  last_shot         JSONB,
  winner_address    TEXT,
  payout_status     TEXT NOT NULL DEFAULT 'pending',
  payout_tx_hash    TEXT,
  created_at        TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMP NOT NULL DEFAULT NOW()
);
