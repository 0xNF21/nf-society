import { pgTable, serial, text, integer, timestamp, jsonb, real } from "drizzle-orm/pg-core";

export const crashDashTables = pgTable("crash_dash_tables", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  betOptions: jsonb("bet_options").notNull().default([5, 10, 50, 100]),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#16A34A"),
  accentColor: text("accent_color").notNull().default("#22C55E"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const crashDashRounds = pgTable("crash_dash_rounds", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").references(() => crashDashTables.id).notNull(),
  playerAddress: text("player_address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  betCrc: integer("bet_crc").notNull(),
  playerToken: text("player_token"),
  gameState: jsonb("game_state").notNull(),
  status: text("status").notNull().default("playing"),
  outcome: text("outcome"),
  crashPoint: real("crash_point"),
  cashoutMultiplier: real("cashout_multiplier"),
  finalMultiplier: real("final_multiplier"),
  payoutCrc: real("payout_crc"),
  payoutStatus: text("payout_status").notNull().default("pending"),
  payoutTxHash: text("payout_tx_hash"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type CrashDashTableRow = typeof crashDashTables.$inferSelect;
export type CrashDashRoundRow = typeof crashDashRounds.$inferSelect;
export type NewCrashDashTable = typeof crashDashTables.$inferInsert;
export type NewCrashDashRound = typeof crashDashRounds.$inferInsert;
