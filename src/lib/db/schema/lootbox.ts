import { integer, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";

export const lootboxes = pgTable("lootboxes", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  pricePerOpenCrc: integer("price_per_open_crc").notNull().default(10),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#92400E"),
  accentColor: text("accent_color").notNull().default("#F59E0B"),
  logoUrl: text("logo_url"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lootboxOpens = pgTable("lootbox_opens", {
  id: serial("id").primaryKey(),
  lootboxId: integer("lootbox_id").references(() => lootboxes.id).notNull(),
  playerAddress: text("player_address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  playerToken: text("player_token"),
  rewardCrc: real("reward_crc").notNull(),
  payoutStatus: text("payout_status").notNull().default("pending"),
  payoutTxHash: text("payout_tx_hash"),
  errorMessage: text("error_message"),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
});
