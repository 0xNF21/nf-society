import { pgTable, serial, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core'
import type { PlayerGrid, LastShot } from '@/lib/relics'

export const relicsGames = pgTable('relics_games', {
  id:               serial('id').primaryKey(),
  slug:             text('slug').notNull().unique(),
  status:           text('status').notNull().default('waiting_p1'),
  betCrc:           integer('bet_crc').notNull(),
  recipientAddress: text('recipient_address').notNull(),
  commissionPct:    integer('commission_pct').notNull().default(5),
  player1Address:   text('player1_address'),
  player2Address:   text('player2_address'),
  player1TxHash:    text('player1_tx_hash'),
  player2TxHash:    text('player2_tx_hash'),
  grid1:            jsonb('grid1').$type<PlayerGrid>(),
  grid2:            jsonb('grid2').$type<PlayerGrid>(),
  ready1:           integer('ready1').notNull().default(0),
  ready2:           integer('ready2').notNull().default(0),
  currentTurn:      text('current_turn'),
  lastShot:         jsonb('last_shot').$type<LastShot>(),
  winnerAddress:    text('winner_address'),
  payoutStatus:     text('payout_status').notNull().default('pending'),
  payoutTxHash:     text('payout_tx_hash'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
})

export type RelicsGameRow = typeof relicsGames.$inferSelect
export type NewRelicsGame  = typeof relicsGames.$inferInsert
