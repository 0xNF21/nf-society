export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { relicsGames } from '@/lib/db/schema/relics'
import { eq } from 'drizzle-orm'
import { createMultiplayerGame } from '@/lib/multiplayer'

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
    const body = await req.json()
    const { game } = await createMultiplayerGame("relics", body)
    return NextResponse.json(game, { status: 201 })
  } catch (e: any) {
    console.error('[Relics] Create error:', e)
    return NextResponse.json({ error: e.message || 'Server error' }, { status: 500 })
  }
}
