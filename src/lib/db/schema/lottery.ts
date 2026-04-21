import { integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const lotteries = pgTable("lotteries", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  organizer: text("organizer").notNull(),
  description: text("description"),
  ticketPriceCrc: integer("ticket_price_crc").notNull().default(5),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#251B9F"),
  accentColor: text("accent_color").notNull().default("#FF491B"),
  logoUrl: text("logo_url"),
  theme: text("theme").notNull().default("light"),
  commissionPercent: integer("commission_percent").notNull().default(5),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const participants = pgTable("participants", {
  id: serial("id").primaryKey(),
  lotteryId: integer("lottery_id").references(() => lotteries.id).notNull(),
  address: text("address").notNull(),
  transactionHash: text("transaction_hash").notNull(),
  playerToken: text("player_token"),
  paidAt: timestamp("paid_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueAddressPerLottery: uniqueIndex("unique_address_per_lottery").on(table.lotteryId, table.address),
}));

export const draws = pgTable("draws", {
  id: serial("id").primaryKey(),
  lotteryId: integer("lottery_id").references(() => lotteries.id).notNull(),
  winnerAddress: text("winner_address").notNull(),
  blockNumber: integer("block_number").notNull(),
  blockHash: text("block_hash").notNull(),
  participantCount: integer("participant_count").notNull(),
  participantAddresses: text("participant_addresses").notNull(),
  selectionIndex: integer("selection_index").notNull(),
  drawnAt: timestamp("drawn_at").defaultNow().notNull(),
});
