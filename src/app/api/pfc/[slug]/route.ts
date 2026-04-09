import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { pfcGames } from "@/lib/db/schema/pfc";
import { eq } from "drizzle-orm";
import { resolveRound, getWinner, isValidMove } from "@/lib/pfc";
import type { PfcState, Move } from "@/lib/pfc";
import { executePayout } from "@/lib/payout";
import { calculateWinAmount } from "@/lib/multiplayer";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const [game] = await db.select().from(pfcGames).where(eq(pfcGames.slug, params.slug));
  if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Hide opponent's current round move (prevent cheating)
  const safeGame = { ...game };
  if (game.gameState && game.status === "playing") {
    const state = game.gameState as PfcState;
    safeGame.gameState = {
      ...state,
      currentRound: {
        p1: state.currentRound.p1 ? "hidden" as unknown as Move : undefined,
        p2: state.currentRound.p2 ? "hidden" as unknown as Move : undefined,
      },
    };
  }
  return NextResponse.json(safeGame);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  try {
    const body = await req.json();
    const { move, playerToken } = body;

    if (!move || !isValidMove(move)) {
      return NextResponse.json({ error: "Invalid move" }, { status: 400 });
    }

    const [game] = await db.select().from(pfcGames).where(eq(pfcGames.slug, params.slug));
    if (!game) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (game.status !== "playing") return NextResponse.json({ error: "Game not active" }, { status: 400 });

    const state = game.gameState as PfcState;
    if (!state) return NextResponse.json({ error: "Invalid game state" }, { status: 500 });

    // Identify player by token (mandatory — anti-cheat)
    if (!playerToken) {
      return NextResponse.json({ error: "Player token required" }, { status: 401 });
    }
    let playerRole: "p1" | "p2" | null = null;
    if (game.player1Token === playerToken) playerRole = "p1";
    else if (game.player2Token === playerToken) playerRole = "p2";

    if (!playerRole) return NextResponse.json({ error: "Invalid player token" }, { status: 401 });

    // Check if player already played this round
    if (state.currentRound[playerRole]) {
      return NextResponse.json({ error: "Already played this round" }, { status: 400 });
    }

    // Record the move
    state.currentRound[playerRole] = move as Move;

    // Check if both players have played
    if (state.currentRound.p1 && state.currentRound.p2) {
      // Resolve round
      const winner = resolveRound(state.currentRound.p1, state.currentRound.p2);
      state.rounds.push({
        p1: state.currentRound.p1,
        p2: state.currentRound.p2,
        winner,
      });
      state.currentRound = {};

      // Check if game is over
      const gameWinner = getWinner(state);
      if (gameWinner) {
        const winnerAddress = gameWinner === "p1" ? game.player1Address : game.player2Address;
        const winAmount = calculateWinAmount(game.betCrc, game.commissionPct);

        await db.update(pfcGames).set({
          gameState: state,
          status: "finished",
          winnerAddress,
          updatedAt: new Date(),
        }).where(eq(pfcGames.id, game.id));

        // Execute payout
        try {
          if (winnerAddress) {
            await executePayout({
              gameType: "pfc",
              gameId: `pfc-${game.slug}-winner`,
              recipientAddress: winnerAddress,
              amountCrc: winAmount,
              reason: `PFC ${game.slug} — victoire, gain ${winAmount} CRC`,
            });

            await db.update(pfcGames).set({
              payoutStatus: "success",
            }).where(eq(pfcGames.id, game.id));
          }
        } catch (e) {
          console.error("[PFC] Payout error:", e);
        }

        const [updated] = await db.select().from(pfcGames).where(eq(pfcGames.id, game.id));
        return NextResponse.json(updated);
      }
    }

    // Update game state (round not finished yet or game continues)
    await db.update(pfcGames).set({
      gameState: state,
      updatedAt: new Date(),
    }).where(eq(pfcGames.id, game.id));

    const [updated] = await db.select().from(pfcGames).where(eq(pfcGames.id, game.id));
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Move failed";
    console.error("[PFC] Move error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
