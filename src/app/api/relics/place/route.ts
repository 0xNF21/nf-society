import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { relicsGames } from '@/lib/db/schema/relics'
import { eq } from 'drizzle-orm'
import { allRelicsPlaced } from '@/lib/relics'
import type { PlayerGrid } from '@/lib/relics'

export async function POST(req: NextRequest) {
  try {
    const { id, player, grid, playerToken } = await req.json() as { id: string; player: string; grid: PlayerGrid; playerToken?: string }
    if (!id || !player || !grid) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const [game] = await db.select().from(relicsGames).where(eq(relicsGames.slug, id))
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (game.status !== 'placing') return NextResponse.json({ error: 'Wrong phase' }, { status: 400 })
    if (!allRelicsPlaced(grid)) return NextResponse.json({ error: 'Not all relics placed' }, { status: 400 })

    const isP1 = game.player1Address?.toLowerCase() === player.toLowerCase()
    const isP2 = game.player2Address?.toLowerCase() === player.toLowerCase()
    if (!isP1 && !isP2) return NextResponse.json({ error: 'Not in game' }, { status: 403 })

    if (playerToken) {
      if (isP1 && game.player1Token && game.player1Token !== playerToken) {
        return NextResponse.json({ error: 'Invalid player token' }, { status: 403 })
      }
      if (isP2 && game.player2Token && game.player2Token !== playerToken) {
        return NextResponse.json({ error: 'Invalid player token' }, { status: 403 })
      }
    }

    const update: Record<string, unknown> = { updatedAt: new Date() }
    if (isP1) { update.grid1 = grid; update.ready1 = 1 }
    if (isP2) { update.grid2 = grid; update.ready2 = 1 }

    // Les deux prêts → on démarre
    const ready1 = isP1 ? 1 : game.ready1
    const ready2 = isP2 ? 1 : game.ready2
    if (ready1 === 1 && ready2 === 1) {
      update.status = 'playing'
      update.currentTurn = game.player1Address // P1 commence
    }

    await db.update(relicsGames).set(update).where(eq(relicsGames.id, game.id))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[Relics] Place error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
