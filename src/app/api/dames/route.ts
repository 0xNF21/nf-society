import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { damesGames } from '@/lib/db/schema/dames'
import { eq } from 'drizzle-orm'
import { createMultiplayerGame } from '@/lib/multiplayer'

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('id')
  if (!slug) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const [game] = await db.select().from(damesGames).where(eq(damesGames.slug, slug))
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ game })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { game } = await createMultiplayerGame("dames", body)
    return NextResponse.json(game, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Server error' }, { status: 500 })
  }
}
