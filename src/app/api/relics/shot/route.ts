import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { relicsGames } from '@/lib/db/schema/relics'
import { eq } from 'drizzle-orm'
import { processShot, isDefeated } from '@/lib/relics'
import { payPrize, payCommission } from '@/lib/wallet'
import type { PlayerGrid } from '@/lib/relics'

export async function POST(req: NextRequest) {
  try {
    const { id, player, row, col, playerToken } = await req.json()
    if (!id || !player || row == null || col == null)
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const [game] = await db.select().from(relicsGames).where(eq(relicsGames.slug, id))
    if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
    if (game.status !== 'playing') return NextResponse.json({ error: 'Game not in progress' }, { status: 400 })
    if (game.currentTurn?.toLowerCase() !== player.toLowerCase())
      return NextResponse.json({ error: 'Not your turn' }, { status: 403 })

    const isP1 = game.player1Address?.toLowerCase() === player.toLowerCase()
    const isP2 = game.player2Address?.toLowerCase() === player.toLowerCase()
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
    const targetGrid = (isP1 ? game.grid2 : game.grid1) as PlayerGrid

    const { grid: newGrid, result } = processShot(targetGrid, row, col)
    if (result === 'already_shot') return NextResponse.json({ error: 'Already shot here' }, { status: 400 })

    const nextTurn = isP1 ? game.player2Address : game.player1Address
    const defeated = isDefeated(newGrid)

    // On a hit or sunk, the shooter plays again
    const keepTurn = result === 'hit' || result === 'sunk'

    // Find which relic was sunk (if any)
    let sunkRelicId: string | null = null
    if (result === 'sunk') {
      const hitRelic = (newGrid.relics as Array<{ id: string; cells: [number, number][]; sunk: boolean }>)
        .find(r => r.sunk && r.cells.some(([cr, cc]: [number, number]) => cr === row && cc === col))
      if (hitRelic) sunkRelicId = hitRelic.id
    }

    const update: Record<string, unknown> = {
      updatedAt: new Date(),
      lastShot: { row, col, result, shooter: player, sunkRelicId },
      currentTurn: defeated ? null : (keepTurn ? player : nextTurn),
      ...(isP1 ? { grid2: newGrid } : { grid1: newGrid }),
      ...(defeated ? { status: 'finished', winnerAddress: player } : {}),
    }

    await db.update(relicsGames).set(update).where(eq(relicsGames.id, game.id))

    // Pay winner asymmetrically (balance/on-chain based on their payment).
    if (defeated) {
      try {
        const pot = game.betCrc * 2
        const winAmount = pot * (1 - game.commissionPct / 100)
        const commissionAmount = pot * (game.commissionPct / 100)
        const winnerTxHash = player === game.player1Address ? game.player1TxHash : game.player2TxHash
        const prize = await payPrize(player, winAmount, {
          gameType: "relics", gameSlug: game.slug, gameRef: `${game.slug}-winner`,
          sourceTxHash: winnerTxHash,
          reason: `Relics ${game.slug} — victoire, gain ${winAmount} CRC`,
        })
        await payCommission(commissionAmount, {
          gameType: "relics", gameSlug: game.slug, gameRef: `${game.slug}-commission`,
          sourceTxHash: winnerTxHash,
        })
        await db.update(relicsGames).set({
          payoutTxHash: prize.method === "balance"
            ? (prize.ledgerId ? `balance-credit:${prize.ledgerId}` : 'balance-credit:duplicate')
            : (prize.transferTxHash || null),
          payoutStatus: prize.ok ? 'success' : 'failed',
          updatedAt: new Date(),
        }).where(eq(relicsGames.id, game.id))
      } catch (e) {
        console.error('[Relics] Payout error:', e)
        await db.update(relicsGames).set({
          payoutStatus: 'failed',
          updatedAt: new Date(),
        }).where(eq(relicsGames.id, game.id))
      }
    }

    return NextResponse.json({ result, winner: defeated ? player : null, sunkRelicId, keepTurn })
  } catch (e) {
    console.error('[Relics] Shot error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
