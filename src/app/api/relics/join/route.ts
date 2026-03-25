import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { relicsGames } from '@/lib/db/schema/relics'
import { eq } from 'drizzle-orm'

// GET /api/relics/join?id=xxx — verify game exists and is joinable
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('id')
  if (!slug) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const [game] = await db.select().from(relicsGames).where(eq(relicsGames.slug, slug))
  if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  if (game.status !== 'waiting_p1' && game.status !== 'waiting_p2') {
    return NextResponse.json({ error: 'Game already started' }, { status: 400 })
  }
  return NextResponse.json({ ok: true, game })
}
