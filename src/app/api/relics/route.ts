import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { relicsGames } from '@/lib/db/schema/relics'
import { eq } from 'drizzle-orm'
import { generateGameCode } from '@/lib/utils'

// GET /api/relics?id=xxx
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('id')
  if (!slug) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const [game] = await db.select().from(relicsGames).where(eq(relicsGames.slug, slug))
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  return NextResponse.json(game)
}

// POST /api/relics — créer une partie
export async function POST(req: NextRequest) {
  try {
    const { betCrc, isPrivate } = await req.json()
    if (!betCrc) return NextResponse.json({ error: 'Missing betCrc' }, { status: 400 })
    const slug = generateGameCode()
    const recipientAddress = process.env.SAFE_ADDRESS || ''
    const [game] = await db.insert(relicsGames).values({
      slug,
      betCrc: Number(betCrc),
      recipientAddress,
      commissionPct: 5,
      status: 'waiting_p1',
      isPrivate: !!isPrivate,
    }).returning()
    return NextResponse.json({ id: game.slug }, { status: 201 })
  } catch (e) {
    console.error('[Relics] Create error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
