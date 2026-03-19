import { pgTable, serial, text, timestamp, integer, uniqueIndex, real, boolean } from "drizzle-orm/pg-core";

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

export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  gameType: text("game_type").notNull(),
  gameId: text("game_id").notNull().unique(),
  recipientAddress: text("recipient_address").notNull(),
  amountCrc: integer("amount_crc").notNull(),
  reason: text("reason"),
  wrapTxHash: text("wrap_tx_hash"),
  transferTxHash: text("transfer_tx_hash"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const lootboxes = pgTable("lootboxes", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  pricePerOpenCrc: integer("price_per_open_crc").notNull().default(10),
  recipientAddress: text("recipient_address").notNull(),
  primaryColor: text("primary_color").notNull().default("#92400E"),
  accentColor: text("accent_color").notNull().default("#F59E0B"),
  logoUrl: text("logo_url"),
  status: text("status").notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lootboxOpens = pgTable("lootbox_opens", {
  id: serial("id").primaryKey(),
  lootboxId: integer("lootbox_id").references(() => lootboxes.id).notNull(),
  playerAddress: text("player_address").notNull(),
  transactionHash: text("transaction_hash").notNull().unique(),
  rewardCrc: real("reward_crc").notNull(),
  payoutStatus: text("payout_status").notNull().default("pending"),
  payoutTxHash: text("payout_tx_hash"),
  errorMessage: text("error_message"),
  openedAt: timestamp("opened_at").defaultNow().notNull(),
});

export const claimedPayments = pgTable("claimed_payments", {
  id: serial("id").primaryKey(),
  txHash: text("tx_hash").notNull().unique(),
  gameType: text("game_type").notNull(),
  gameId: integer("game_id").notNull(),
  playerAddress: text("player_address").notNull(),
  amountCrc: integer("amount_crc").notNull(),
  claimedAt: timestamp("claimed_at").defaultNow().notNull(),
});

export const morpionGames = pgTable("morpion_games", {
  id:               serial("id").primaryKey(),
  slug:             text("slug").notNull().unique(),
  betCrc:           integer("bet_crc").notNull(),
  recipientAddress: text("recipient_address").notNull(),
  commissionPct:    integer("commission_pct").notNull().default(5),
  player1Address:   text("player1_address"),
  player2Address:   text("player2_address"),
  player1TxHash:    text("player1_tx_hash"),
  player2TxHash:    text("player2_tx_hash"),
  board:            text("board").notNull().default("---------"),
  currentTurn:      text("current_turn").notNull().default("X"),
  status:           text("status").notNull().default("waiting_p1"),
  result:           text("result"),
  winnerAddress:    text("winner_address"),
  payoutStatus:     text("payout_status").notNull().default("pending"),
  payoutTxHash:     text("payout_tx_hash"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
});

export const morpionMoves = pgTable("morpion_moves", {
  id:            serial("id").primaryKey(),
  gameId:        integer("game_id").references(() => morpionGames.id).notNull(),
  playerAddress: text("player_address").notNull(),
  position:      integer("position").notNull(),
  symbol:        text("symbol").notNull(),
  moveNumber:    integer("move_number").notNull(),
  createdAt:     timestamp("created_at").defaultNow().notNull(),
});

export const players = pgTable("players", {
  address:   text("address").primaryKey(),
  xp:        integer("xp").notNull().default(0),
  level:     integer("level").notNull().default(1),
  streak:    integer("streak").notNull().default(0),
  lastSeen:  timestamp("last_seen").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const badges = pgTable("badges", {
  id:        serial("id").primaryKey(),
  slug:      text("slug").notNull().unique(),
  name:      text("name").notNull(),
  description: text("description").notNull(),
  icon:      text("icon").notNull(),
  iconType:  text("icon_type").notNull().default("emoji"),
  category:  text("category").notNull(),
  secret:    boolean("secret").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const playerBadges = pgTable("player_badges", {
  id:        serial("id").primaryKey(),
  address:   text("address").notNull(),
  badgeSlug: text("badge_slug").notNull(),
  earnedAt:  timestamp("earned_at").defaultNow().notNull(),
}, (table) => ({
  uniqueBadgePerPlayer: uniqueIndex("unique_badge_per_player").on(table.address, table.badgeSlug),
}));

export const exchanges = pgTable("exchanges", {
  id: serial("id").primaryKey(),
  senderAddress: text("sender_address").notNull(),
  amountCrc: text("amount_crc").notNull(),
  amountHuman: text("amount_human").notNull(),
  incomingTxHash: text("incoming_tx_hash").notNull().unique(),
  outgoingTxHash: text("outgoing_tx_hash"),
  status: text("status").notNull().default("detected"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
