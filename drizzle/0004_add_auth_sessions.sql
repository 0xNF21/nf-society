-- Auth sessions infrastructure for the F2P pivot follow-up.
--
-- Adds two tables :
--   auth_challenges : short-lived proof-of-wallet challenges
--                    (sign_message for Mini App, 1-CRC payment for standalone).
--   auth_sessions   : long-lived server-trusted sessions tied to a wallet.
--
-- Idempotent (CREATE TABLE IF NOT EXISTS + IF NOT EXISTS on indexes) so the
-- migration is safe to re-run if Drizzle's journal lags behind prod.
--
-- Out of scope : dao_xp_pool, game_xp_events, feature_flags — these were
-- created by the manual `0002_add_real_stakes_flag_and_dao_pool.sql` and
-- `0003_add_chance_xp_only_flag.sql` migrations applied directly on prod
-- before the journal caught up.

CREATE TABLE IF NOT EXISTS "auth_challenges" (
	"id" serial PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"nonce" text NOT NULL,
	"message" text NOT NULL,
	"expected_address" text,
	"tx_hash" text,
	"signature" text,
	"refund_tx_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"origin" text,
	"metadata" jsonb,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	CONSTRAINT "auth_challenges_nonce_unique" UNIQUE("nonce")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"address" text NOT NULL,
	"origin" text NOT NULL,
	"last_auth_challenge_id" integer,
	"user_agent_hash" text,
	"expires_at" timestamp NOT NULL,
	"hard_expires_at" timestamp NOT NULL,
	"last_active_at" timestamp DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_nonce_idx" ON "auth_challenges" USING btree ("nonce");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_status_idx" ON "auth_challenges" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_expires_at_idx" ON "auth_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_challenges_tx_hash_idx" ON "auth_challenges" USING btree ("tx_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_token_hash_idx" ON "auth_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_address_idx" ON "auth_sessions" USING btree ("address");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "auth_sessions_expires_at_idx" ON "auth_sessions" USING btree ("expires_at");
