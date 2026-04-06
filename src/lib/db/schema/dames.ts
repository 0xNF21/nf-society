import { pgTable, serial, text, integer, jsonb, timestamp, boolean } from 'drizzle-orm/pg-core'
import type { DamesState, GameStatus } from '@/lib/dames'

export const damesGames = pgTable('dames_games', {
  id:               serial('id').primaryKey(),
  slug:             text('slug').notNull().unique(),
  status:           text('status').notNull().$type<GameStatus>().default('waiting_p1'),
  betCrc:           integer('bet_crc').notNull(),
  recipientAddress: text('recipient_address').notNull(),
  commissionPct:    integer('commission_pct').notNull().default(5),
  player1Address:   text('player1_address'),
  player2Address:   text('player2_address'),
  player1TxHash:    text('player1_tx_hash'),
  player2TxHash:    text('player2_tx_hash'),
  player1Token:     text('player1_token'),
  player2Token:     text('player2_token'),
  isPrivate:        boolean('is_private').notNull().default(false),
  gameState:        jsonb('game_state').$type<DamesState>(),
  winnerAddress:    text('winner_address'),
  payoutStatus:     text('payout_status').notNull().default('pending'),
  payoutTxHash:     text('payout_tx_hash'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
})

export type DamesGameRow = typeof damesGames.$inferSelect
export type NewDamesGame  = typeof damesGames.$inferInsert
