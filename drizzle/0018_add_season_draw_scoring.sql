ALTER TABLE "season_games" ADD COLUMN IF NOT EXISTS "points_draw" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "season_scores" ADD COLUMN IF NOT EXISTS "draws" integer DEFAULT 0 NOT NULL;
