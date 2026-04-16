import { pgTable, serial, text, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";

export const plinkoTables = pgTable("plinko_tables", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  betOptions: jsonb("bet_options").notNull().default([1, 5, 10, 25]),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#7C3AED"),
  accentColor: text("accent_color").notNull().default("#8B5CF6"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const plinkoRounds = pgTable("plinko_rounds", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").references(() => plinkoTables.id).notNull(),
  playerAddress: text("player_address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  betCrc: integer("bet_crc").notNull(),
  playerToken: text("player_token"),
  gameState: jsonb("game_state").notNull(),
  status: text("status").notNull().default("playing"),
  ballPath: jsonb("ball_path"),
  finalBucket: integer("final_bucket"),
  outcome: text("outcome"),
  finalMultiplier: real("final_multiplier"),
  payoutCrc: real("payout_crc"),
  payoutStatus: text("payout_status").notNull().default("pending"),
  payoutTxHash: text("payout_tx_hash"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type PlinkoTableRow = typeof plinkoTables.$inferSelect;
export type PlinkoRoundRow = typeof plinkoRounds.$inferSelect;
export type NewPlinkoTable = typeof plinkoTables.$inferInsert;
export type NewPlinkoRound = typeof plinkoRounds.$inferInsert;
