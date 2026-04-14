import { pgTable, serial, text, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";

export const diceTables = pgTable("dice_tables", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  betOptions: jsonb("bet_options").notNull().default([1, 5, 10, 25]),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#F59E0B"),
  accentColor: text("accent_color").notNull().default("#D97706"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const diceRounds = pgTable("dice_rounds", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").references(() => diceTables.id).notNull(),
  playerAddress: text("player_address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  betCrc: integer("bet_crc").notNull(),
  playerToken: text("player_token"),
  gameState: jsonb("game_state").notNull(),
  status: text("status").notNull().default("playing"),
  target: real("target"),
  direction: text("direction"),
  result: real("result"),
  outcome: text("outcome"),
  finalMultiplier: real("final_multiplier"),
  payoutCrc: real("payout_crc"),
  payoutStatus: text("payout_status").notNull().default("pending"),
  payoutTxHash: text("payout_tx_hash"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type DiceTableRow = typeof diceTables.$inferSelect;
export type DiceRoundRow = typeof diceRounds.$inferSelect;
export type NewDiceTable = typeof diceTables.$inferInsert;
export type NewDiceRound = typeof diceRounds.$inferInsert;
