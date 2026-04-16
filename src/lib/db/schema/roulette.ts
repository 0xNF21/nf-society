import { pgTable, serial, text, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";

export const rouletteTables = pgTable("roulette_tables", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  betOptions: jsonb("bet_options").notNull().default([1, 5, 10, 25]),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#DC2626"),
  accentColor: text("accent_color").notNull().default("#B91C1C"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rouletteRounds = pgTable("roulette_rounds", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").references(() => rouletteTables.id).notNull(),
  playerAddress: text("player_address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  betCrc: integer("bet_crc").notNull(),
  playerToken: text("player_token"),
  gameState: jsonb("game_state").notNull(),
  status: text("status").notNull().default("playing"),
  bets: jsonb("bets"),
  result: integer("result"),
  outcome: text("outcome"),
  payoutCrc: real("payout_crc"),
  payoutStatus: text("payout_status").notNull().default("pending"),
  payoutTxHash: text("payout_tx_hash"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type RouletteTableRow = typeof rouletteTables.$inferSelect;
export type RouletteRoundRow = typeof rouletteRounds.$inferSelect;
export type NewRouletteTable = typeof rouletteTables.$inferInsert;
export type NewRouletteRound = typeof rouletteRounds.$inferInsert;
