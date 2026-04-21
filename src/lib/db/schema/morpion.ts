import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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
  player1Token:     text("player1_token"),
  player2Token:     text("player2_token"),
  isPrivate:        boolean("is_private").notNull().default(false),
  board:            text("board").notNull().default("---------"),
  currentTurn:      text("current_turn").notNull().default("X"),
  status:           text("status").notNull().default("waiting_p1"),
  result:           text("result"),
  winnerAddress:    text("winner_address"),
  rematchSlug:      text("rematch_slug"),
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
