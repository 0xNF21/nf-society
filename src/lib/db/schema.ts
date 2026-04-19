import { pgTable, serial, text, timestamp, integer, uniqueIndex, real, boolean, jsonb } from "drizzle-orm/pg-core";

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
  playerToken: text("player_token"),
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

export const memoryGames = pgTable("memory_games", {
  id:               serial("id").primaryKey(),
  slug:             text("slug").notNull().unique(),
  betCrc:           integer("bet_crc").notNull(),
  difficulty:       text("difficulty").notNull().default("medium"),
  recipientAddress: text("recipient_address").notNull(),
  commissionPct:    integer("commission_pct").notNull().default(5),
  player1Address:   text("player1_address"),
  player2Address:   text("player2_address"),
  player1TxHash:    text("player1_tx_hash"),
  player2TxHash:    text("player2_tx_hash"),
  player1Token:     text("player1_token"),
  player2Token:     text("player2_token"),
  player1Moves:     integer("player1_moves"),
  player1Time:      integer("player1_time"),
  player2Moves:     integer("player2_moves"),
  player2Time:      integer("player2_time"),
  isPrivate:        boolean("is_private").notNull().default(false),
  rematchSlug:      text("rematch_slug"),
  gridSeed:         text("grid_seed").notNull(),
  currentTurn:      text("current_turn").notNull().default("player1"),
  player1Pairs:     integer("player1_pairs").notNull().default(0),
  player2Pairs:     integer("player2_pairs").notNull().default(0),
  boardState:       text("board_state").notNull().default("{}"),
  status:           text("status").notNull().default("waiting_p1"),
  winnerAddress:    text("winner_address"),
  result:           text("result"),
  payoutStatus:     text("payout_status").notNull().default("pending"),
  payoutTxHash:     text("payout_tx_hash"),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
});

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

export const shopSessions = pgTable("shop_sessions", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  address: text("address"),
  txHash: text("tx_hash"),
  refunded: boolean("refunded").notNull().default(false),
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

export const shopItems = pgTable("shop_items", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  category: text("category").notNull(),
  xpCost: integer("xp_cost").notNull(),
  levelRequired: integer("level_required").notNull().default(1),
  refundType: text("refund_type"),
  refundAmountCrc: integer("refund_amount_crc"),
  stock: integer("stock"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shopPurchases = pgTable("shop_purchases", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  itemSlug: text("item_slug").notNull(),
  xpSpent: integer("xp_spent").notNull(),
  effectApplied: boolean("effect_applied").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shopCoupons = pgTable("shop_coupons", {
  id: serial("id").primaryKey(),
  address: text("address").notNull(),
  type: text("type").notNull(),
  used: boolean("used").notNull().default(false),
  usedAt: timestamp("used_at"),
  txHashUsed: text("tx_hash_used"),
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

export const dailyRewardsConfig = pgTable("daily_rewards_config", {
  key: text("key").primaryKey(),
  rewards: jsonb("rewards").notNull(),
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

export { relicsGames } from "./schema/relics";
export type { RelicsGameRow, NewRelicsGame } from "./schema/relics";

export { damesGames } from "./schema/dames";
export type { DamesGameRow, NewDamesGame } from "./schema/dames";

export { pfcGames } from "./schema/pfc";
export type { PfcGameRow, NewPfcGame } from "./schema/pfc";

export { blackjackTables, blackjackHands } from "./schema/blackjack";
export type { BlackjackTableRow, BlackjackHandRow, NewBlackjackTable, NewBlackjackHand } from "./schema/blackjack";

export { coinFlipTables, coinFlipResults } from "./schema/coin-flip";
export type { CoinFlipTableRow, CoinFlipResultRow, NewCoinFlipTable, NewCoinFlipResult } from "./schema/coin-flip";

export { hiloTables, hiloRounds } from "./schema/hilo";
export type { HiloTableRow, HiloRoundRow, NewHiloTable, NewHiloRound } from "./schema/hilo";

export { minesTables, minesRounds } from "./schema/mines";
export type { MinesTableRow, MinesRoundRow, NewMinesTable, NewMinesRound } from "./schema/mines";

export { diceTables, diceRounds } from "./schema/dice";
export type { DiceTableRow, DiceRoundRow, NewDiceTable, NewDiceRound } from "./schema/dice";

export { crashDashTables, crashDashRounds } from "./schema/crash-dash";
export type { CrashDashTableRow, CrashDashRoundRow, NewCrashDashTable, NewCrashDashRound } from "./schema/crash-dash";

export { kenoTables, kenoRounds } from "./schema/keno";
export type { KenoTableRow, KenoRoundRow, NewKenoTable, NewKenoRound } from "./schema/keno";

export { rouletteTables, rouletteRounds } from "./schema/roulette";
export type { RouletteTableRow, RouletteRoundRow, NewRouletteTable, NewRouletteRound } from "./schema/roulette";

export { plinkoTables, plinkoRounds } from "./schema/plinko";
export type { PlinkoTableRow, PlinkoRoundRow, NewPlinkoTable, NewPlinkoRound } from "./schema/plinko";

export { supportMessages } from "./schema/support";
export type { SupportMessageRow, NewSupportMessage } from "./schema/support";

export { crcRacesGames } from "./schema/crc-races";
export type { CrcRacesGameRow, NewCrcRacesGame, PayoutEntry as CrcRacesPayoutEntry } from "./schema/crc-races";
