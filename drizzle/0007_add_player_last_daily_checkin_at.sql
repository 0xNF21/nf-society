ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "last_daily_checkin_at" timestamp;

-- Intentionally not backfilled from last_seen: last_seen is also touched by
-- games, payouts, and wallet activity, so using it here would preserve the bug
-- where normal play can block a daily check-in.
