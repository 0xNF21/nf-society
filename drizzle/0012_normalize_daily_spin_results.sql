-- Normalize historical daily wheel JSON from playable XP wording to Fragments.
DO $$
BEGIN
  IF to_regclass('public.daily_rewards_config') IS NOT NULL THEN
    BEGIN
      UPDATE "daily_rewards_config"
      SET "rewards" = (
        SELECT jsonb_agg(
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
        )
        FROM jsonb_array_elements("rewards") AS elem
      )
      WHERE jsonb_typeof("rewards") = 'array'
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements("rewards") AS elem
          WHERE elem ? 'xpValue'
            OR COALESCE(elem->>'type', '') LIKE 'xp_%'
            OR COALESCE(elem->>'label', '') ~* 'XP( de solde)?'
        );
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipping daily rewards config Fragments cleanup: %', SQLERRM;
    END;
  END IF;

  IF to_regclass('public.daily_sessions') IS NOT NULL THEN
    BEGIN
      EXECUTE $sql$
        WITH parsed AS (
          SELECT
            "id",
            "spin_result"::jsonb AS result
          FROM "daily_sessions"
          WHERE "spin_result" IS NOT NULL
            AND btrim("spin_result") <> ''
            AND btrim("spin_result") LIKE '{%'
            AND (
              "spin_result"::jsonb ? 'xpValue'
              OR COALESCE("spin_result"::jsonb->>'type', '') LIKE 'xp_%'
              OR COALESCE("spin_result"::jsonb->>'label', '') ~* 'XP( de solde)?'
            )
        )
        UPDATE "daily_sessions" AS sessions
        SET "spin_result" = (
          jsonb_set(
            jsonb_set(
              (parsed.result - 'xpValue') || jsonb_build_object(
                'fragmentsValue',
                FLOOR(COALESCE(
                  CASE WHEN parsed.result ? 'fragmentsValue' THEN (parsed.result->>'fragmentsValue')::numeric END,
                  CASE WHEN parsed.result ? 'xpValue' THEN (parsed.result->>'xpValue')::numeric END,
                  0
                ))::integer
              ),
              '{label}',
              to_jsonb(regexp_replace(COALESCE(parsed.result->>'label', ''), 'XP( de solde)?', 'Fragments', 'gi'))
            ),
            '{type}',
            to_jsonb(regexp_replace(COALESCE(parsed.result->>'type', ''), '^xp_', 'fragments_'))
          )
        )::text
        FROM parsed
        WHERE sessions."id" = parsed."id"
      $sql$;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipping daily spin_result Fragments cleanup: %', SQLERRM;
    END;
  END IF;
END $$;
