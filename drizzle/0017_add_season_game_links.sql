CREATE TABLE IF NOT EXISTS "season_game_links" (
  "id" serial PRIMARY KEY,
  "season_slug" text NOT NULL,
  "game_key" text NOT NULL,
  "game_slug" text NOT NULL,
  "source" text NOT NULL DEFAULT 'lobby',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "season_game_links_unique_game_idx"
  ON "season_game_links" ("game_key", "game_slug");
CREATE INDEX IF NOT EXISTS "season_game_links_season_idx"
  ON "season_game_links" ("season_slug");
CREATE INDEX IF NOT EXISTS "season_game_links_game_idx"
  ON "season_game_links" ("game_key");
