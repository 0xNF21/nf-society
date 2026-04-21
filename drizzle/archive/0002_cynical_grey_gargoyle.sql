CREATE TABLE "daily_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"address" text,
	"tx_hash" text,
	"date" text NOT NULL,
	"scratch_result" text,
	"scratch_played" boolean DEFAULT false NOT NULL,
	"spin_result" text,
	"spin_played" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "daily_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "jackpot_pool" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"amount_crc" integer DEFAULT 1 NOT NULL,
	"tx_hash" text NOT NULL,
	"date" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "jackpot_pool_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "memory_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"bet_crc" integer NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL,
	"recipient_address" text NOT NULL,
	"commission_pct" integer DEFAULT 5 NOT NULL,
	"player1_address" text,
	"player2_address" text,
	"player1_tx_hash" text,
	"player2_tx_hash" text,
	"player1_moves" integer,
	"player1_time" integer,
	"player2_moves" integer,
	"player2_time" integer,
	"grid_seed" text NOT NULL,
	"current_turn" text DEFAULT 'player1' NOT NULL,
	"player1_pairs" integer DEFAULT 0 NOT NULL,
	"player2_pairs" integer DEFAULT 0 NOT NULL,
	"board_state" text DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'waiting_p1' NOT NULL,
	"winner_address" text,
	"result" text,
	"payout_status" text DEFAULT 'pending' NOT NULL,
	"payout_tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "memory_games_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "relics_games" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"player1" text NOT NULL,
	"player2" text,
	"bet" text NOT NULL,
	"grid1" jsonb,
	"grid2" jsonb,
	"ready1" integer DEFAULT 0 NOT NULL,
	"ready2" integer DEFAULT 0 NOT NULL,
	"current_turn" text,
	"last_shot" jsonb,
	"winner" text,
	"payout_tx" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_coupons" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"type" text NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp,
	"tx_hash_used" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL,
	"category" text NOT NULL,
	"xp_cost" integer NOT NULL,
	"level_required" integer DEFAULT 1 NOT NULL,
	"refund_type" text,
	"refund_amount_crc" integer,
	"stock" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_items_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "shop_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"address" text NOT NULL,
	"item_slug" text NOT NULL,
	"xp_spent" integer NOT NULL,
	"effect_applied" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shop_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"address" text,
	"tx_hash" text,
	"refunded" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shop_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "xp_spent" integer DEFAULT 0 NOT NULL;