import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { damesGames } from '@/lib/db/schema/dames'
import { eq } from 'drizzle-orm'
import { generateGameCode } from '@/lib/utils'

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('id')
  if (!slug) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  const [game] = await db.select().from(damesGames).where(eq(damesGames.slug, slug))
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ game })
}

export async function POST(req: NextRequest) {
  try {
    const { betCrc } = await req.json()
    if (!betCrc) return NextResponse.json({ error: 'Missing betCrc' }, { status: 400 })
    const slug = generateGameCode()
    const recipientAddress = process.env.SAFE_ADDRESS ?? ''
    const [game] = await db.insert(damesGames).values({ slug, betCrc, recipientAddress }).returning()
    return NextResponse.json({ id: game.slug })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
