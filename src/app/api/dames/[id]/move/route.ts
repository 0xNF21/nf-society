import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { damesGames } from '@/lib/db/schema/dames'
import { eq } from 'drizzle-orm'
import { isValidMove, applyMove } from '@/lib/dames'
import type { Move, DamesState } from '@/lib/dames'
import { executePayout } from '@/lib/payout'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: slug } = await params
    const { player, move, playerToken }: { player: string; move: Move; playerToken?: string } = await req.json()
    if (!player || !move) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const [game] = await db.select().from(damesGames).where(eq(damesGames.slug, slug))
    if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (game.status !== 'playing') return NextResponse.json({ error: 'Game not in progress' }, { status: 400 })
    const playerLC = player.toLowerCase()
    const isP1 = game.player1Address?.toLowerCase() === playerLC
    const isP2 = game.player2Address?.toLowerCase() === playerLC
    if (!isP1 && !isP2) return NextResponse.json({ error: 'Not in game' }, { status: 403 })
    // Verify player token (mandatory — anti-cheat)
    if (!playerToken) {
      return NextResponse.json({ error: 'Player token required' }, { status: 401 })
    }
    if (isP1 && game.player1Token !== playerToken) {
      return NextResponse.json({ error: 'Invalid player token' }, { status: 401 })
    }
    if (isP2 && game.player2Token !== playerToken) {
      return NextResponse.json({ error: 'Invalid player token' }, { status: 401 })
    }
    const state = game.gameState as DamesState
    const expectedPlayer = state.currentPlayer === 1 ? game.player1Address : game.player2Address
    if (expectedPlayer?.toLowerCase() !== playerLC) return NextResponse.json({ error: 'Not your turn' }, { status: 403 })
    if (!isValidMove(state, move)) return NextResponse.json({ error: 'Invalid move' }, { status: 400 })
    const newState = applyMove(state, move)
    const finished = !!newState.winner
    await db.update(damesGames).set({
      gameState: newState, winnerAddress: finished ? player : null,
      status: finished ? 'finished' : 'playing', updatedAt: new Date(),
    }).where(eq(damesGames.id, game.id))
    if (finished) {
      try {
        const pot = game.betCrc * 2
        const winAmount = pot * (1 - game.commissionPct / 100)
        const payoutResult = await executePayout({
          gameType: 'dames', gameId: `dames-${game.slug}-winner`,
          recipientAddress: player, amountCrc: winAmount,
          reason: `Dames ${game.slug} — victoire, gain ${winAmount} CRC`,
        })
        await db.update(damesGames).set({
          payoutTxHash: payoutResult.transferTxHash || null,
          payoutStatus: payoutResult.success ? 'success' : 'failed',
          updatedAt: new Date(),
        }).where(eq(damesGames.id, game.id))
      } catch (e) {
        console.error('[Dames] Payout error:', e)
        await db.update(damesGames).set({
          payoutStatus: 'failed',
          updatedAt: new Date(),
        }).where(eq(damesGames.id, game.id))
      }
    }
    return NextResponse.json({ ok: true, state: newState })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
