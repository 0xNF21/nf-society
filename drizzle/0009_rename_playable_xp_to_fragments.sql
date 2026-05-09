-- Rename the playable Free-to-Play balance from XP to Fragments.
-- XP remains the progression/level metric (`players.xp`, `xp_events.amount_xp`).

DO $$
BEGIN
  IF to_regclass('public.players') IS NOT NULL THEN
    ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "fragments_balance" integer NOT NULL DEFAULT 0;
    ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "fragments_spent" integer NOT NULL DEFAULT 0;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'xp_spent'
    ) THEN
      EXECUTE 'UPDATE "players"
               SET "fragments_balance" = GREATEST("fragments_balance", COALESCE("xp" - "xp_spent", 0)),
                   "fragments_spent" = GREATEST(0, COALESCE("xp_spent", 0))';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'xp_balance'
    ) THEN
      EXECUTE 'UPDATE "players"
               SET "fragments_balance" = GREATEST("fragments_balance", COALESCE("xp_balance", 0))';
      ALTER TABLE "players" DROP COLUMN "xp_balance";
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'players' AND column_name = 'xp_spent'
    ) THEN
      ALTER TABLE "players" DROP COLUMN "xp_spent";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.xp_events') IS NOT NULL THEN
    ALTER TABLE "xp_events" ADD COLUMN IF NOT EXISTS "fragments_balance_after" integer NOT NULL DEFAULT 0;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'xp_events' AND column_name = 'xp_balance_after'
    ) THEN
      EXECUTE 'UPDATE "xp_events"
               SET "fragments_balance_after" = GREATEST("fragments_balance_after", COALESCE("xp_balance_after", 0))';
      ALTER TABLE "xp_events" DROP COLUMN "xp_balance_after";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.privacy_settings') IS NOT NULL THEN
    ALTER TABLE "privacy_settings" ADD COLUMN IF NOT EXISTS "hide_fragments_spent" boolean NOT NULL DEFAULT false;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'privacy_settings' AND column_name = 'hide_xp_spent'
    ) THEN
      EXECUTE 'UPDATE "privacy_settings"
               SET "hide_fragments_spent" = "hide_fragments_spent" OR COALESCE("hide_xp_spent", false)';
      ALTER TABLE "privacy_settings" DROP COLUMN "hide_xp_spent";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.shop_items') IS NOT NULL THEN
    ALTER TABLE "shop_items" ADD COLUMN IF NOT EXISTS "fragments_cost" integer NOT NULL DEFAULT 0;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'shop_items' AND column_name = 'xp_cost'
    ) THEN
      EXECUTE 'UPDATE "shop_items"
               SET "fragments_cost" = CASE
                 WHEN "fragments_cost" > 0 THEN "fragments_cost"
                 ELSE COALESCE("xp_cost", 0)
               END';
      ALTER TABLE "shop_items" DROP COLUMN "xp_cost";
    END IF;
  END IF;

  IF to_regclass('public.shop_purchases') IS NOT NULL THEN
    ALTER TABLE "shop_purchases" ADD COLUMN IF NOT EXISTS "fragments_spent" integer NOT NULL DEFAULT 0;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'shop_purchases' AND column_name = 'xp_spent'
    ) THEN
      EXECUTE 'UPDATE "shop_purchases"
               SET "fragments_spent" = CASE
                 WHEN "fragments_spent" > 0 THEN "fragments_spent"
                 ELSE COALESCE("xp_spent", 0)
               END';
      ALTER TABLE "shop_purchases" DROP COLUMN "xp_spent";
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.dao_xp_pool') IS NOT NULL AND to_regclass('public.dao_fragments_pool') IS NULL THEN
    ALTER TABLE "dao_xp_pool" RENAME TO "dao_fragments_pool";
  END IF;

  CREATE TABLE IF NOT EXISTS "dao_fragments_pool" (
    "id" serial PRIMARY KEY NOT NULL,
    "source" text NOT NULL,
    "game_key" text,
    "amount_fragments" bigint NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  );

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dao_fragments_pool' AND column_name = 'amount_xp'
  ) THEN
    ALTER TABLE "dao_fragments_pool" RENAME COLUMN "amount_xp" TO "amount_fragments";
  END IF;

  IF to_regclass('public.dao_xp_pool') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'dao_xp_pool' AND column_name = 'amount_xp'
    ) THEN
      EXECUTE 'INSERT INTO "dao_fragments_pool" ("source", "game_key", "amount_fragments", "created_at")
               SELECT "source", "game_key", "amount_xp", "created_at" FROM "dao_xp_pool"';
    END IF;
    DROP TABLE "dao_xp_pool";
  END IF;

  ALTER INDEX IF EXISTS "dao_xp_pool_created_at_idx" RENAME TO "dao_fragments_pool_created_at_idx";
  ALTER INDEX IF EXISTS "dao_xp_pool_source_idx" RENAME TO "dao_fragments_pool_source_idx";
  CREATE INDEX IF NOT EXISTS "dao_fragments_pool_created_at_idx" ON "dao_fragments_pool" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "dao_fragments_pool_source_idx" ON "dao_fragments_pool" USING btree ("source");
END $$;

DO $$
BEGIN
  IF to_regclass('public.game_xp_events') IS NOT NULL AND to_regclass('public.game_fragment_events') IS NULL THEN
    ALTER TABLE "game_xp_events" RENAME TO "game_fragment_events";
  END IF;

  CREATE TABLE IF NOT EXISTS "game_fragment_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "game_key" text NOT NULL,
    "game_slug" text,
    "player_address" text,
    "player_token" text,
    "event_type" text NOT NULL,
    "amount_fragments" bigint NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL
  );

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'game_fragment_events' AND column_name = 'amount_xp'
  ) THEN
    ALTER TABLE "game_fragment_events" RENAME COLUMN "amount_xp" TO "amount_fragments";
  END IF;

  IF to_regclass('public.game_xp_events') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'game_xp_events' AND column_name = 'amount_xp'
    ) THEN
      EXECUTE 'INSERT INTO "game_fragment_events" ("game_key", "game_slug", "player_address", "player_token", "event_type", "amount_fragments", "created_at")
               SELECT "game_key", "game_slug", "player_address", "player_token", "event_type", "amount_xp", "created_at" FROM "game_xp_events"';
    END IF;
    DROP TABLE "game_xp_events";
  END IF;

  ALTER INDEX IF EXISTS "game_xp_events_created_at_idx" RENAME TO "game_fragment_events_created_at_idx";
  ALTER INDEX IF EXISTS "game_xp_events_game_key_idx" RENAME TO "game_fragment_events_game_key_idx";
  ALTER INDEX IF EXISTS "game_xp_events_player_idx" RENAME TO "game_fragment_events_player_idx";
  CREATE INDEX IF NOT EXISTS "game_fragment_events_created_at_idx" ON "game_fragment_events" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "game_fragment_events_game_key_idx" ON "game_fragment_events" USING btree ("game_key");
  CREATE INDEX IF NOT EXISTS "game_fragment_events_player_idx" ON "game_fragment_events" USING btree ("player_address");
END $$;

INSERT INTO "feature_flags" ("key", "status", "label", "category", "updated_at")
SELECT
  'chance_games_fragments_only',
  "status",
  'Chance games Fragments-only',
  "category",
  NOW()
FROM "feature_flags"
WHERE "key" = 'chance_games_xp_only'
ON CONFLICT ("key") DO NOTHING;

UPDATE "feature_flags"
SET "label" = 'Chance games Fragments-only',
    "updated_at" = NOW()
WHERE "key" = 'chance_games_fragments_only';

DELETE FROM "feature_flags"
WHERE "key" = 'chance_games_xp_only';

UPDATE "daily_rewards_config"
SET "rewards" = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'xpValue' THEN
        jsonb_set(
          jsonb_set(
            (elem - 'xpValue') || jsonb_build_object(
              'fragmentsValue',
              FLOOR(COALESCE(
                CASE WHEN elem ? 'fragmentsValue' THEN (elem->>'fragmentsValue')::numeric END,
                CASE WHEN elem ? 'xpValue' THEN (elem->>'xpValue')::numeric END,
                0
              ))::integer
            ),
            '{label}',
            to_jsonb(regexp_replace(COALESCE(elem->>'label', ''), 'XP( de solde)?', 'Fragments', 'gi'))
          ),
          '{type}',
          to_jsonb(regexp_replace(COALESCE(elem->>'type', ''), '^xp_', 'fragments_'))
        )
      ELSE elem
    END
  )
  FROM jsonb_array_elements("rewards") AS elem
)
WHERE to_regclass('public.daily_rewards_config') IS NOT NULL
  AND jsonb_typeof("rewards") = 'array';
