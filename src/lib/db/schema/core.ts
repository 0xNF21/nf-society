import { pgTable, serial, text, timestamp, integer, uniqueIndex, real, boolean, jsonb } from "drizzle-orm/pg-core";

export const payouts = pgTable("payouts", {
  id: serial("id").primaryKey(),
  gameType: text("game_type").notNull(),
  gameId: text("game_id").notNull().unique(),
  recipientAddress: text("recipient_address").notNull(),
  amountCrc: real("amount_crc").notNull(),
  reason: text("reason"),
  wrapTxHash: text("wrap_tx_hash"),
  transferTxHash: text("transfer_tx_hash"),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
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

export const players = pgTable("players", {
  address:    text("address").primaryKey(),
  xp:         integer("xp").notNull().default(0),
  xpSpent:    integer("xp_spent").notNull().default(0),
  level:      integer("level").notNull().default(1),
  streak:     integer("streak").notNull().default(0),
  balanceCrc: real("balance_crc").notNull().default(0),
  lastSeen:   timestamp("last_seen").defaultNow().notNull(),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

/**
 * Wallet ledger — append-only log of every balance movement.
 * Invariant (checked by 3e monitoring): for each address,
 *   balance_crc in players == sum(amount_crc in wallet_ledger WHERE address = X).
 *
 * `tx_hash` is UNIQUE and non-null only for on-chain movements (topup, cashout);
 * internal movements (game debit/credit) leave it null.
 */
export const walletLedger = pgTable("wallet_ledger", {
  id:           serial("id").primaryKey(),
  address:      text("address").notNull(),
  kind:         text("kind").notNull(), // 'topup' | 'debit' | 'prize' | 'cashout' | 'cashout-refund'
  amountCrc:    real("amount_crc").notNull(), // signed: negative = debit
  balanceAfter: real("balance_after").notNull(),
  reason:       text("reason"),
  txHash:       text("tx_hash").unique(),
  gameType:     text("game_type"),
  gameSlug:     text("game_slug"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
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
  condition: jsonb("condition").$type<BadgeCondition>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BadgeCondition = {
  type: "first" | "streak" | "count" | "hour_before" | "hour_between" | "lose_streak" | "manual"
    | "xp_threshold" | "level_threshold" | "games_played" | "games_won" | "crc_won" | "multi_game";
  action?: string;
  value?: number;
  min?: number;
  max?: number;
};

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

export const privacySettings = pgTable("privacy_settings", {
  address:             text("address").primaryKey(),
  hidePnl:             boolean("hide_pnl").notNull().default(false),
  hideTotalBet:        boolean("hide_total_bet").notNull().default(false),
  hideXpSpent:         boolean("hide_xp_spent").notNull().default(false),
  hideGameHistory:     boolean("hide_game_history").notNull().default(false),
  hideFromLeaderboard: boolean("hide_from_leaderboard").notNull().default(false),
  hideFromSearch:      boolean("hide_from_search").notNull().default(false),
  updatedAt:           timestamp("updated_at").defaultNow().notNull(),
});
export type PrivacySettings = typeof privacySettings.$inferSelect;

export const nfAuthTokens = pgTable("nf_auth_tokens", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  address: text("address"),
  txHash: text("tx_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const featureFlags = pgTable("feature_flags", {
  key: text("key").primaryKey(),
  status: text("status").notNull().default("enabled"),
  label: text("label").notNull(),
  category: text("category").notNull().default("general"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const xpConfig = pgTable("xp_config", {
  key: text("key").primaryKey(),
  value: integer("value").notNull(),
  category: text("category").notNull().default("reward"),
  label: text("label").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Bot wallet state — single-row table tracking the next available nonce for the
// payout bot. The UPDATE ... RETURNING pattern guarantees atomic nonce reservation
// across concurrent lambdas, eliminating "replacement fee too low" races.
export const botState = pgTable("bot_state", {
  id:         integer("id").primaryKey().default(1),
  lastNonce:  integer("last_nonce").notNull(),
  updatedAt:  timestamp("updated_at").defaultNow().notNull(),
});

// Re-exports from sub-files have moved to `./index.ts`.
// This file holds only the tables that were defined inline before PR #9.
