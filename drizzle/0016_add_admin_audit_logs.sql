CREATE TABLE IF NOT EXISTS "admin_audit_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "action" text NOT NULL,
  "season_slug" text,
  "actor" text DEFAULT 'admin' NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "summary" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "admin_audit_logs_action_idx"
  ON "admin_audit_logs" ("action");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_season_idx"
  ON "admin_audit_logs" ("season_slug");
CREATE INDEX IF NOT EXISTS "admin_audit_logs_created_at_idx"
  ON "admin_audit_logs" ("created_at");
