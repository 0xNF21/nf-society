import { pgTable, serial, text, timestamp, integer, uniqueIndex, index, real, boolean, jsonb, bigint } from "drizzle-orm/pg-core";

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
  fragmentsBalance: integer("fragments_balance").notNull().default(0),
  fragmentsSpent:   integer("fragments_spent").notNull().default(0),
  level:      integer("level").notNull().default(1),
  streak:     integer("streak").notNull().default(0),
  balanceCrc: real("balance_crc").notNull().default(0),
  lastSeen:   timestamp("last_seen").defaultNow().notNull(),
  lastDailyCheckinAt: timestamp("last_daily_checkin_at"),
  createdAt:  timestamp("created_at").defaultNow().notNull(),
});

export const xpEvents = pgTable("xp_events", {
  id:             serial("id").primaryKey(),
  address:        text("address").notNull(),
  action:         text("action").notNull(),
  amountXp:       integer("amount_xp").notNull(),
  sourceType:     text("source_type").notNull(),
  sourceId:       text("source_id").notNull(),
  xpAfter:        integer("xp_after").notNull(),
  fragmentsBalanceAfter: integer("fragments_balance_after").notNull(),
  levelAfter:     integer("level_after").notNull(),
  metadata:       jsonb("metadata").$type<Record<string, unknown> | null>(),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  uniqueSource: uniqueIndex("xp_events_unique_source_idx")
    .on(table.address, table.action, table.sourceType, table.sourceId),
  addressIdx: index("xp_events_address_idx").on(table.address),
  createdAtIdx: index("xp_events_created_at_idx").on(table.createdAt),
}));

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
  hideFragmentsSpent:  boolean("hide_fragments_spent").notNull().default(false),
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

// ─── Free-to-Play pivot (PR 1) ──────────────────────────────────────────
//
// Les commissions et mises reelles (CRC) sont gatees derriere le flag
// `real_stakes` de `feature_flags`. Quand le flag est `hidden`, les jeux
// tournent en mode Free-to-Play Fragments et remplissent les deux tables ci-dessous.
// Les tables de jeux existantes (morpion_games, blackjack_hands, ...) ne sont
// pas modifiees — elles continuent de stocker l'historique CRC intact.

// Pot communautaire Fragments : commissions 5% multi + house edge chance agregees
// pour affichage sur /dashboard-dao. Append-only, pas de cashout.
export const daoFragmentsPool = pgTable("dao_fragments_pool", {
  id: serial("id").primaryKey(),
  source: text("source").notNull(),      // 'commission_multiplayer' | 'house_edge_chance' | 'other'
  gameKey: text("game_key"),
  amountFragments: bigint("amount_fragments", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  createdAtIdx: index("dao_fragments_pool_created_at_idx").on(t.createdAt),
  sourceIdx: index("dao_fragments_pool_source_idx").on(t.source),
}));

// Journal des mises/gains Fragments (parties F2P uniquement). Alimente la nouvelle
// page /stats en mode F2P. event_type: 'bet' | 'win' | 'loss' | 'draw'.
export const gameFragmentEvents = pgTable("game_fragment_events", {
  id: serial("id").primaryKey(),
  gameKey: text("game_key").notNull(),
  gameSlug: text("game_slug"),
  playerAddress: text("player_address"),
  playerToken: text("player_token"),
  eventType: text("event_type").notNull(),
  amountFragments: bigint("amount_fragments", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  createdAtIdx: index("game_fragment_events_created_at_idx").on(t.createdAt),
  gameKeyIdx: index("game_fragment_events_game_key_idx").on(t.gameKey),
  playerIdx: index("game_fragment_events_player_idx").on(t.playerAddress),
}));

// Re-exports from sub-files have moved to `./index.ts`.
// This file holds only the tables that were defined inline before PR #9.
