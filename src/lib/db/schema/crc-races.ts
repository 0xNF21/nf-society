import { pgTable, serial, text, integer, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
import type { RaceStatus, RacePlayer, RaceState, RaceTier } from "@/lib/crc-races";

export type PayoutEntry = {
  rank: number;
  address: string;
  amountCrc: number;
  status: "pending" | "sending" | "success" | "failed";
  txHash: string | null;
  error: string | null;
};

export const crcRacesGames = pgTable("crc_races_games", {
  id:               serial("id").primaryKey(),
  slug:             text("slug").notNull().unique(),
  tier:             text("tier").notNull().$type<RaceTier>(),
  betCrc:           integer("bet_crc").notNull(),
  maxPlayers:       integer("max_players").notNull(),
  commissionPct:    integer("commission_pct").notNull().default(5),
  recipientAddress: text("recipient_address").notNull(),
  isPrivate:        boolean("is_private").notNull().default(false),
  players:          jsonb("players").$type<RacePlayer[]>().notNull().default([]),
  status:           text("status").notNull().$type<RaceStatus>().default("waiting"),
  gameState:        jsonb("game_state").$type<RaceState>(),
  winnerAddress:    text("winner_address"),
  payouts:          jsonb("payouts").$type<PayoutEntry[]>().notNull().default([]),
  payoutStatus:     text("payout_status").notNull().default("pending"),
  rematchSlug:      text("rematch_slug"),
  startedAt:        timestamp("started_at"),
  finishedAt:       timestamp("finished_at"),
  createdAt:        timestamp("created_at").notNull().defaultNow(),
  updatedAt:        timestamp("updated_at").notNull().defaultNow(),
});

export type CrcRacesGameRow = typeof crcRacesGames.$inferSelect;
export type NewCrcRacesGame = typeof crcRacesGames.$inferInsert;
