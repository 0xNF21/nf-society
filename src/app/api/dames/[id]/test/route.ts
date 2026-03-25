import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { damesGames } from '@/lib/db/schema/dames'
import { eq } from 'drizzle-orm'
import { createInitialState } from '@/lib/dames'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (process.env.NODE_ENV !== 'development')
    return NextResponse.json({ error: 'Dev only' }, { status: 403 })
  const { id: slug } = await params
  const mode = _req.nextUrl.searchParams.get('mode') ?? 'inject'
  const p1 = '0x1111111111111111111111111111111111111111'
  const p2 = '0x2222222222222222222222222222222222222222'
  if (mode === 'inject') {
    await db.update(damesGames).set({
      player1Address: p1, player1TxHash: '0xtest1',
      status: 'waiting_p2', updatedAt: new Date(),
    }).where(eq(damesGames.slug, slug))
  } else if (mode === 'skip') {
    await db.update(damesGames).set({
      player1Address: p1, player1TxHash: '0xtest1',
      player2Address: p2, player2TxHash: '0xtest2',
      status: 'playing', gameState: createInitialState(), updatedAt: new Date(),
    }).where(eq(damesGames.slug, slug))
  }
  const [game] = await db.select().from(damesGames).where(eq(damesGames.slug, slug))
  return NextResponse.json({ ok: true, game })
}
