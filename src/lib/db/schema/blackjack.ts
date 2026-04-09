import { pgTable, serial, text, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";

export const blackjackTables = pgTable("blackjack_tables", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  betOptions: jsonb("bet_options").notNull().default([1, 5, 10, 25]),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#1a5c2e"),
  accentColor: text("accent_color").notNull().default("#10B981"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const blackjackHands = pgTable("blackjack_hands", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").references(() => blackjackTables.id).notNull(),
  playerAddress: text("player_address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  betCrc: integer("bet_crc").notNull(),
  // Full game state stored as JSON (deck, hands, dealer, etc.)
  gameState: jsonb("game_state").notNull(),
  status: text("status").notNull().default("dealing"),
  // Final outcome summary
  outcome: text("outcome"), // "win" | "loss" | "push" | "blackjack" | "bust"
  payoutCrc: real("payout_crc"),
  payoutStatus: text("payout_status").notNull().default("pending"),
  payoutTxHash: text("payout_tx_hash"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type BlackjackTableRow = typeof blackjackTables.$inferSelect;
export type BlackjackHandRow = typeof blackjackHands.$inferSelect;
export type NewBlackjackTable = typeof blackjackTables.$inferInsert;
export type NewBlackjackHand = typeof blackjackHands.$inferInsert;
