ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "xp_balance" integer NOT NULL DEFAULT 0;

UPDATE "players"
SET "xp_balance" = GREATEST("xp" - "xp_spent", 0);
