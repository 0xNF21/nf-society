import { pgTable, serial, text, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";

export const coinFlipTables = pgTable("coin_flip_tables", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  betOptions: jsonb("bet_options").notNull().default([1, 5, 10, 25]),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#0EA5E9"),
  accentColor: text("accent_color").notNull().default("#0284C7"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const coinFlipResults = pgTable("coin_flip_results", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").references(() => coinFlipTables.id).notNull(),
  playerAddress: text("player_address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  betCrc: integer("bet_crc").notNull(),
  playerToken: text("player_token"),
  playerChoice: text("player_choice").notNull(), // "heads" | "tails"
  coinResult: text("coin_result").notNull(),      // "heads" | "tails"
  outcome: text("outcome").notNull(),             // "win" | "loss"
  payoutCrc: real("payout_crc"),
  payoutStatus: text("payout_status").notNull().default("pending"),
  payoutTxHash: text("payout_tx_hash"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CoinFlipTableRow = typeof coinFlipTables.$inferSelect;
export type CoinFlipResultRow = typeof coinFlipResults.$inferSelect;
export type NewCoinFlipTable = typeof coinFlipTables.$inferInsert;
export type NewCoinFlipResult = typeof coinFlipResults.$inferInsert;
