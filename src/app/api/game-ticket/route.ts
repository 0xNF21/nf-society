export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  nfAuthTokens,
  morpionGames, memoryGames, relicsGames, damesGames, pfcGames,
  blackjackTables, blackjackHands,
  hiloTables, hiloRounds,
  minesTables, minesRounds,
  kenoTables, kenoRounds,
  rouletteTables, rouletteRounds,
  diceTables, diceRounds,
  plinkoTables, plinkoRounds,
  crashDashTables, crashDashRounds,
  coinFlipTables, coinFlipResults,
} from "@/lib/db/schema";
import { eq, and, ne, desc } from "drizzle-orm";

const MULTI_TABLES: Record<string, any> = {
  morpion: morpionGames,
  memory: memoryGames,
  relics: relicsGames,
  dames: damesGames,
  pfc: pfcGames,
};

const CHANCE_TABLES: Record<string, { tables: any; rounds: any; excludeFinished?: boolean }> = {
  blackjack: { tables: blackjackTables, rounds: blackjackHands },
  hilo: { tables: hiloTables, rounds: hiloRounds },
  mines: { tables: minesTables, rounds: minesRounds },
  keno: { tables: kenoTables, rounds: kenoRounds },
  roulette: { tables: rouletteTables, rounds: rouletteRounds },
  dice: { tables: diceTables, rounds: diceRounds },
  plinko: { tables: plinkoTables, rounds: plinkoRounds },
  crash_dash: { tables: crashDashTables, rounds: crashDashRounds },
  "crash-dash": { tables: crashDashTables, rounds: crashDashRounds },
  coin_flip: { tables: coinFlipTables, rounds: coinFlipResults },
  "coin-flip": { tables: coinFlipTables, rounds: coinFlipResults },
};

export async function GET(req: NextRequest) {
  try {
    const gameKey = req.nextUrl.searchParams.get("gameKey");
    const slug = req.nextUrl.searchParams.get("slug");
    const authToken = req.nextUrl.searchParams.get("authToken");

    if (!gameKey || !slug || !authToken) {
      return NextResponse.json({ error: "gameKey, slug, authToken required" }, { status: 400 });
    }

    const [session] = await db.select().from(nfAuthTokens)
      .where(eq(nfAuthTokens.token, authToken)).limit(1);
    if (!session) return NextResponse.json({ status: "auth_not_found" }, { status: 404 });
    if (!session.address) return NextResponse.json({ status: "auth_not_confirmed" });
    if (Date.now() > new Date(session.expiresAt).getTime()) {
      return NextResponse.json({ status: "auth_expired" });
    }

    const address = session.address.toLowerCase();

    // Multiplayer dispatch
    if (MULTI_TABLES[gameKey]) {
      const table = MULTI_TABLES[gameKey];
      const [game] = await db.select().from(table).where(eq(table.slug, slug)).limit(1);
      if (!game) return NextResponse.json({ status: "game_not_found" }, { status: 404 });

      if (game.player1Address && game.player1Address.toLowerCase() === address) {
        return NextResponse.json({ status: "confirmed", role: "p1", token: game.player1Token });
      }
      if (game.player2Address && game.player2Address.toLowerCase() === address) {
        return NextResponse.json({ status: "confirmed", role: "p2", token: game.player2Token });
      }
      return NextResponse.json({ status: "not_a_player" });
    }

    // Chance dispatch
    if (CHANCE_TABLES[gameKey]) {
      const { tables, rounds } = CHANCE_TABLES[gameKey];
      const [ct] = await db.select().from(tables).where(eq(tables.slug, slug)).limit(1);
      if (!ct) return NextResponse.json({ status: "game_not_found" }, { status: 404 });

      // Find most recent non-finished round for this address
      const conditions = [
        eq(rounds.tableId, ct.id),
        eq(rounds.playerAddress, address),
      ];
      // Only filter by status if the column exists (coin-flip uses 5min recency instead)
      if (rounds.status) {
        conditions.push(ne(rounds.status, "finished"));
      }
      const [round] = await db.select().from(rounds)
        .where(and(...conditions))
        .orderBy(desc(rounds.createdAt))
        .limit(1);
      if (!round) return NextResponse.json({ status: "no_active_round" });
      if (!round.playerToken) return NextResponse.json({ status: "no_token_stored" });

      return NextResponse.json({ status: "confirmed", role: "solo", token: round.playerToken });
    }

    return NextResponse.json({ status: "unknown_game" }, { status: 400 });
  } catch (error: any) {
    console.error("[GameTicket] Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
