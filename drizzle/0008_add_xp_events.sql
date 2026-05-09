CREATE TABLE IF NOT EXISTS "xp_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "address" text NOT NULL,
  "action" text NOT NULL,
  "amount_xp" integer NOT NULL,
  "source_type" text NOT NULL,
  "source_id" text NOT NULL,
  "xp_after" integer NOT NULL,
  "xp_balance_after" integer NOT NULL,
  "level_after" integer NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "xp_events_unique_source_idx"
  ON "xp_events" USING btree ("address", "action", "source_type", "source_id");

CREATE INDEX IF NOT EXISTS "xp_events_address_idx"
  ON "xp_events" USING btree ("address");

CREATE INDEX IF NOT EXISTS "xp_events_created_at_idx"
  ON "xp_events" USING btree ("created_at");

INSERT INTO "xp_events" (
  "address",
  "action",
  "amount_xp",
  "source_type",
  "source_id",
  "xp_after",
  "xp_balance_after",
  "level_after",
  "metadata"
)
SELECT
  "address",
  'legacy_import',
  "xp",
  'migration',
  '0008_add_xp_events',
  "xp",
  "xp_balance",
  "level",
  jsonb_build_object('reason', 'XP balance before xp_events ledger')
FROM "players"
WHERE "xp" > 0
ON CONFLICT DO NOTHING;
