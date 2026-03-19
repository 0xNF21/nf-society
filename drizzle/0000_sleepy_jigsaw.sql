CREATE TABLE "claimed_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"tx_hash" text NOT NULL,
	"game_type" text NOT NULL,
	"game_id" integer NOT NULL,
	"player_address" text NOT NULL,
	"amount_crc" integer NOT NULL,
	"claimed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "claimed_payments_tx_hash_unique" UNIQUE("tx_hash")
);
--> statement-breakpoint
CREATE TABLE "draws" (
	"id" serial PRIMARY KEY NOT NULL,
	"lottery_id" integer NOT NULL,
	"winner_address" text NOT NULL,
	"block_number" integer NOT NULL,
	"block_hash" text NOT NULL,
	"participant_count" integer NOT NULL,
	"participant_addresses" text NOT NULL,
	"selection_index" integer NOT NULL,
	"drawn_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchanges" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_address" text NOT NULL,
	"amount_crc" text NOT NULL,
	"amount_human" text NOT NULL,
	"incoming_tx_hash" text NOT NULL,
	"outgoing_tx_hash" text,
	"status" text DEFAULT 'detected' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exchanges_incoming_tx_hash_unique" UNIQUE("incoming_tx_hash")
);
--> statement-breakpoint
CREATE TABLE "lootbox_opens" (
	"id" serial PRIMARY KEY NOT NULL,
	"lootbox_id" integer NOT NULL,
	"player_address" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"reward_crc" real NOT NULL,
	"payout_status" text DEFAULT 'pending' NOT NULL,
	"payout_tx_hash" text,
	"error_message" text,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lootbox_opens_transaction_hash_unique" UNIQUE("transaction_hash")
);
--> statement-breakpoint
CREATE TABLE "lootboxes" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"price_per_open_crc" integer DEFAULT 10 NOT NULL,
	"recipient_address" text NOT NULL,
	"primary_color" text DEFAULT '#92400E' NOT NULL,
	"accent_color" text DEFAULT '#F59E0B' NOT NULL,
	"logo_url" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lootboxes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "lotteries" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"organizer" text NOT NULL,
	"description" text,
	"ticket_price_crc" integer DEFAULT 5 NOT NULL,
	"recipient_address" text NOT NULL,
	"primary_color" text DEFAULT '#251B9F' NOT NULL,
	"accent_color" text DEFAULT '#FF491B' NOT NULL,
	"logo_url" text,
	"theme" text DEFAULT 'light' NOT NULL,
	"commission_percent" integer DEFAULT 5 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lotteries_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "morpion_games" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"bet_crc" integer NOT NULL,
	"recipient_address" text NOT NULL,
	"commission_pct" integer DEFAULT 10 NOT NULL,
	"player1_address" text,
	"player2_address" text,
	"player1_tx_hash" text,
	"player2_tx_hash" text,
	"board" text DEFAULT '---------' NOT NULL,
	"current_turn" text DEFAULT 'X' NOT NULL,
	"status" text DEFAULT 'waiting_p1' NOT NULL,
	"result" text,
	"winner_address" text,
	"payout_status" text DEFAULT 'pending' NOT NULL,
	"payout_tx_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "morpion_games_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "morpion_moves" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"player_address" text NOT NULL,
	"position" integer NOT NULL,
	"symbol" text NOT NULL,
	"move_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"lottery_id" integer NOT NULL,
	"address" text NOT NULL,
	"transaction_hash" text NOT NULL,
	"paid_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_type" text NOT NULL,
	"game_id" text NOT NULL,
	"recipient_address" text NOT NULL,
	"amount_crc" integer NOT NULL,
	"reason" text,
	"wrap_tx_hash" text,
	"transfer_tx_hash" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payouts_game_id_unique" UNIQUE("game_id")
);
--> statement-breakpoint
ALTER TABLE "draws" ADD CONSTRAINT "draws_lottery_id_lotteries_id_fk" FOREIGN KEY ("lottery_id") REFERENCES "public"."lotteries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lootbox_opens" ADD CONSTRAINT "lootbox_opens_lootbox_id_lootboxes_id_fk" FOREIGN KEY ("lootbox_id") REFERENCES "public"."lootboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morpion_moves" ADD CONSTRAINT "morpion_moves_game_id_morpion_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."morpion_games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_lottery_id_lotteries_id_fk" FOREIGN KEY ("lottery_id") REFERENCES "public"."lotteries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "unique_address_per_lottery" ON "participants" USING btree ("lottery_id","address");