-- 0002_add_real_stakes_flag_and_dao_pool.sql
--
-- PR 1 du pivot Free-to-Play :
--   1) Table `dao_xp_pool` : append-only ledger des XP communautaires accumules
--      via les commissions des jeux (5% multi, house edge chance). Affichee
--      sur /dashboard-dao. Pas de cashout — c'est une metrique de gamification.
--   2) Table `game_xp_events` : append-only log de toutes les mises/gains XP
--      des parties F2P (apres pivot). Sert a alimenter la nouvelle page /stats
--      en mode F2P. Ne touche pas les tables de jeux existantes (morpion_games,
--      blackjack_hands, etc.) qui restent telles quelles pour l'historique CRC.
--   3) Seed du flag `real_stakes` dans `feature_flags` :
--        - status='enabled' : mode CRC classique (mise/gain/payout on-chain).
--                             La page /stats affiche les donnees CRC actuelles.
--        - status='hidden'  : mode Free-to-Play XP (kill switch actif).
--                             La page /stats bascule sur la nouvelle vue XP.
--                             L'historique CRC reste accessible admin-only.
--      Default='enabled' pour preserver le comportement actuel. L'admin
--      toggle via /admin?tab=flags pour activer le pivot.
--
-- AUCUNE donnee supprimee, aucune colonne modifiee. Migration purement additive.
-- Idempotent : IF NOT EXISTS + ON CONFLICT DO NOTHING.

CREATE TABLE IF NOT EXISTS "dao_xp_pool" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"game_key" text,
	"amount_xp" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dao_xp_pool_created_at_idx" ON "dao_xp_pool" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dao_xp_pool_source_idx" ON "dao_xp_pool" USING btree ("source");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "game_xp_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_key" text NOT NULL,
	"game_slug" text,
	"player_address" text,
	"player_token" text,
	"event_type" text NOT NULL,
	"amount_xp" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_xp_events_created_at_idx" ON "game_xp_events" USING btree ("created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_xp_events_game_key_idx" ON "game_xp_events" USING btree ("game_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "game_xp_events_player_idx" ON "game_xp_events" USING btree ("player_address");
--> statement-breakpoint
INSERT INTO "feature_flags" ("key", "status", "label", "category", "updated_at")
VALUES ('real_stakes', 'enabled', 'Paiements CRC (mise/gain reels)', 'governance', now())
ON CONFLICT ("key") DO NOTHING;
