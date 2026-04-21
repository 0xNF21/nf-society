CREATE TABLE "multiplayer_announcements" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_key" text NOT NULL,
	"slug" text NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"telegram_message_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mp_announcements_game_slug_idx" ON "multiplayer_announcements" USING btree ("game_key","slug");