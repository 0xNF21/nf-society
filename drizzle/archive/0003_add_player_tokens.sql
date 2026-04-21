-- Migration: Add player token columns for secure player identification
-- Tokens are set during payment scan and used to verify player identity on moves

ALTER TABLE dames_games ADD COLUMN IF NOT EXISTS player1_token TEXT;
ALTER TABLE dames_games ADD COLUMN IF NOT EXISTS player2_token TEXT;

ALTER TABLE relics_games ADD COLUMN IF NOT EXISTS player1_token TEXT;
ALTER TABLE relics_games ADD COLUMN IF NOT EXISTS player2_token TEXT;

ALTER TABLE memory_games ADD COLUMN IF NOT EXISTS player1_token TEXT;
ALTER TABLE memory_games ADD COLUMN IF NOT EXISTS player2_token TEXT;

ALTER TABLE morpion_games ADD COLUMN IF NOT EXISTS player1_token TEXT;
ALTER TABLE morpion_games ADD COLUMN IF NOT EXISTS player2_token TEXT;
