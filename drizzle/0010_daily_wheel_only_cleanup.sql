-- Daily is now wheel-only and free after sign-in.
ALTER TABLE "daily_sessions" DROP COLUMN IF EXISTS "scratch_result";
ALTER TABLE "daily_sessions" DROP COLUMN IF EXISTS "scratch_played";

UPDATE "shop_items"
SET "active" = false
WHERE "slug" IN ('spin_refund', 'spin_week_refund');
