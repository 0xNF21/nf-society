import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const dailySessions = pgTable("daily_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  address: text("address"),
  txHash: text("tx_hash"),
  date: text("date").notNull(),
  scratchResult: text("scratch_result"),
  scratchPlayed: boolean("scratch_played").notNull().default(false),
  spinResult: text("spin_result"),
  spinPlayed: boolean("spin_played").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jackpotPool = pgTable("jackpot_pool", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  amountCrc: integer("amount_crc").notNull().default(1),
  txHash: text("tx_hash").notNull().unique(),
  date: text("date").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const dailyRewardsConfig = pgTable("daily_rewards_config", {
  key: text("key").primaryKey(),
  rewards: jsonb("rewards").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
