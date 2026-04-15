import { pgTable, serial, text, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";

export const kenoTables = pgTable("keno_tables", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  betOptions: jsonb("bet_options").notNull().default([1, 5, 10, 25]),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#6366F1"),
  accentColor: text("accent_color").notNull().default("#818CF8"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const kenoRounds = pgTable("keno_rounds", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").references(() => kenoTables.id).notNull(),
  playerAddress: text("player_address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  betCrc: integer("bet_crc").notNull(),
  pickCount: integer("pick_count").notNull(),
  playerToken: text("player_token"),
  gameState: jsonb("game_state").notNull(),
  status: text("status").notNull().default("playing"),
  outcome: text("outcome"),
  hits: integer("hits").notNull().default(0),
  finalMultiplier: real("final_multiplier"),
  payoutCrc: real("payout_crc"),
  payoutStatus: text("payout_status").notNull().default("pending"),
  payoutTxHash: text("payout_tx_hash"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type KenoTableRow = typeof kenoTables.$inferSelect;
export type KenoRoundRow = typeof kenoRounds.$inferSelect;
export type NewKenoTable = typeof kenoTables.$inferInsert;
export type NewKenoRound = typeof kenoRounds.$inferInsert;
