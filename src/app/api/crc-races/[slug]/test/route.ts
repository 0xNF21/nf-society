export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crcRacesGames } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  createInitialState,
  horseEmojiForIndex,
  resetPlayerForRace,
  type RacePlayer,
  type RaceStatus,
} from "@/lib/crc-races";

/**
 * Dev-only helper to inject fake players + optionally skip to racing status.
 * ?mode=inject → fill remaining seats with fake bots, go to countdown
 * ?mode=skip   → inject + jump straight to round 1 choice phase
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Dev only" }, { status: 403 });
  }
  const mode = req.nextUrl.searchParams.get("mode") || "inject";

  const [game] = await db.select().from(crcRacesGames).where(eq(crcRacesGames.slug, params.slug)).limit(1);
  if (!game) return NextResponse.json({ error: "Race not found" }, { status: 404 });

  const existing: RacePlayer[] = Array.isArray(game.players) ? [...game.players] : [];
  const toAdd = Math.max(0, game.maxPlayers - existing.length);
  for (let i = 0; i < toAdd; i++) {
    const idx = existing.length;
    const fakeAddr = `0xfff${String(idx).padStart(37, "f")}0`.slice(0, 42);
    existing.push(resetPlayerForRace({
      address: fakeAddr,
      token: `bot-${idx}-${Date.now().toString(36)}`,
      txHash: `0xfake${idx}${Date.now().toString(16)}`,
      circlesName: `Bot ${idx + 1}`,
      circlesAvatar: null,
      horseEmoji: horseEmojiForIndex(idx),
    }));
  }

  let state = (game.gameState as ReturnType<typeof createInitialState>) || createInitialState();
  let status: RaceStatus = "countdown";
  state = { ...state, countdownStartAt: Date.now() };

  if (mode === "skip") {
    status = "racing";
    state = {
      ...state,
      currentRound: 1,
      phase: "choice",
      phaseStartAt: Date.now(),
      startedAt: Date.now(),
    };
  }

  await db.update(crcRacesGames).set({
    players: existing,
    status,
    gameState: state,
    startedAt: status === "racing" ? new Date() : null,
    updatedAt: new Date(),
  }).where(eq(crcRacesGames.id, game.id));

  return NextResponse.json({ ok: true, added: toAdd, status });
}
