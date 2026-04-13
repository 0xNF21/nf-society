import { pgTable, serial, text, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";

export const minesTables = pgTable("mines_tables", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  betOptions: jsonb("bet_options").notNull().default([1, 5, 10, 25]),
  mineOptions: jsonb("mine_options").notNull().default([1, 3, 5, 10, 24]),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#DC2626"),
  accentColor: text("accent_color").notNull().default("#EF4444"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const minesRounds = pgTable("mines_rounds", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").references(() => minesTables.id).notNull(),
  playerAddress: text("player_address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  betCrc: integer("bet_crc").notNull(),
  mineCount: integer("mine_count").notNull(),
  playerToken: text("player_token"),
  gameState: jsonb("game_state").notNull(),
  status: text("status").notNull().default("playing"),
  outcome: text("outcome"),
  gemsRevealed: integer("gems_revealed").notNull().default(0),
  finalMultiplier: real("final_multiplier"),
  payoutCrc: real("payout_crc"),
  payoutStatus: text("payout_status").notNull().default("pending"),
  payoutTxHash: text("payout_tx_hash"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MinesTableRow = typeof minesTables.$inferSelect;
export type MinesRoundRow = typeof minesRounds.$inferSelect;
export type NewMinesTable = typeof minesTables.$inferInsert;
export type NewMinesRound = typeof minesRounds.$inferInsert;
