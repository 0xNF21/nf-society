CREATE TABLE "badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"icon_type" text DEFAULT 'emoji' NOT NULL,
	"category" text NOT NULL,
	"secret" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "badges_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "player_badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"badge_slug" text NOT NULL,
	"earned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"address" text PRIMARY KEY NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "morpion_games" ALTER COLUMN "commission_pct" SET DEFAULT 5;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_badge_per_player" ON "player_badges" USING btree ("address","badge_slug");