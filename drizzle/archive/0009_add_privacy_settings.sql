-- Migration: Add privacy_settings table
-- Allows players to hide PnL, bets, history, leaderboard, search visibility

CREATE TABLE IF NOT EXISTS privacy_settings (
  address TEXT PRIMARY KEY,
  hide_pnl BOOLEAN NOT NULL DEFAULT false,
  hide_total_bet BOOLEAN NOT NULL DEFAULT false,
  hide_xp_spent BOOLEAN NOT NULL DEFAULT false,
  hide_game_history BOOLEAN NOT NULL DEFAULT false,
  hide_from_leaderboard BOOLEAN NOT NULL DEFAULT false,
  hide_from_search BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
