import { pgTable, serial, text, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import type { PfcState } from "@/lib/pfc";

export const pfcGames = pgTable("pfc_games", {
  id:               serial("id").primaryKey(),
  slug:             text("slug").notNull().unique(),
  status:           text("status").notNull().default("waiting_p1"),
  betCrc:           integer("bet_crc").notNull(),
  bestOf:           integer("best_of").notNull().default(3),
  recipientAddress: text("recipient_address").notNull(),
  commissionPct:    integer("commission_pct").notNull().default(5),
  player1Address:   text("player1_address"),
  player2Address:   text("player2_address"),
  player1TxHash:    text("player1_tx_hash"),
  player2TxHash:    text("player2_tx_hash"),
  player1Token:     text("player1_token"),
  player2Token:     text("player2_token"),
  isPrivate:        boolean("is_private").notNull().default(false),
  gameState:        jsonb("game_state").$type<PfcState>(),
  winnerAddress:    text("winner_address"),
  payoutStatus:     text("payout_status").notNull().default("pending"),
  payoutTxHash:     text("payout_tx_hash"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});

export type PfcGameRow = typeof pfcGames.$inferSelect;
export type NewPfcGame = typeof pfcGames.$inferInsert;
