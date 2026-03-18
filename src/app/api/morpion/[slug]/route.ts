import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { morpionGames, morpionMoves } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { executePayout } from "@/lib/payout";

const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function checkWinner(board: string): "X" | "O" | "draw" | null {
  for (const [a, b, c] of WINS) {
    if (board[a] !== "-" && board[a] === board[b] && board[b] === board[c])
      return board[a] as "X" | "O";
  }
  if (!board.includes("-")) return "draw";
  return null;
}

// GET /api/morpion/[slug] — game state (polled every 2s)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const [game] = await db.select().from(morpionGames).where(eq(morpionGames.slug, slug)).limit(1);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const moves = await db.select().from(morpionMoves)
    .where(eq(morpionMoves.gameId, game.id))
    .orderBy(asc(morpionMoves.moveNumber));

  return NextResponse.json({ ...game, moves });
}

// POST /api/morpion/[slug] — make a move
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const body = await req.json();
    const { playerAddress, position } = body;

    if (!playerAddress || typeof position !== "number" || position < 0 || position > 8) {
      return NextResponse.json({ error: "playerAddress and position (0-8) required" }, { status: 400 });
    }

    const [game] = await db.select().from(morpionGames).where(eq(morpionGames.slug, slug)).limit(1);
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    if (game.status !== "active") return NextResponse.json({ error: "Game is not active" }, { status: 400 });

    const addr = playerAddress.toLowerCase();
    const p1 = game.player1Address?.toLowerCase();
    const p2 = game.player2Address?.toLowerCase();

    // Verify it's the player's turn
    const isP1 = addr === p1;
    const isP2 = addr === p2;
    if (!isP1 && !isP2) return NextResponse.json({ error: "You are not a player in this game" }, { status: 403 });

    const expectedSymbol = game.currentTurn;
    if (isP1 && expectedSymbol !== "X") return NextResponse.json({ error: "Not your turn" }, { status: 400 });
    if (isP2 && expectedSymbol !== "O") return NextResponse.json({ error: "Not your turn" }, { status: 400 });

    // Check position is empty
    const board = game.board.split("");
    if (board[position] !== "-") return NextResponse.json({ error: "Position already taken" }, { status: 400 });

    // Apply move
    board[position] = expectedSymbol;
    const newBoard = board.join("");

    // Count moves for moveNumber
    const existingMoves = await db.select().from(morpionMoves).where(eq(morpionMoves.gameId, game.id));
    const moveNumber = existingMoves.length + 1;

    await db.insert(morpionMoves).values({
      gameId: game.id,
      playerAddress: addr,
      position,
      symbol: expectedSymbol,
      moveNumber,
    });

    const winResult = checkWinner(newBoard);
    const nextTurn = expectedSymbol === "X" ? "O" : "X";

    if (winResult === null) {
      // Game continues
      await db.update(morpionGames).set({
        board: newBoard,
        currentTurn: nextTurn,
        updatedAt: new Date(),
      }).where(eq(morpionGames.id, game.id));
      return NextResponse.json({ status: "active", board: newBoard });
    }

    // Game finished
    let result: string;
    let winnerAddress: string | null = null;
    if (winResult === "draw") {
      result = "draw";
    } else {
      result = winResult === "X" ? "player1" : "player2";
      winnerAddress = winResult === "X" ? (p1 ?? null) : (p2 ?? null);
    }

    await db.update(morpionGames).set({
      board: newBoard,
      status: "finished",
      result,
      winnerAddress,
      updatedAt: new Date(),
    }).where(eq(morpionGames.id, game.id));

    // Trigger payout
    const pot = game.betCrc * 2;
    const fee = Math.floor(pot * game.commissionPct / 100);
    const winAmount = pot - fee;

    if (winResult === "draw") {
      // Refund both players
      if (p1) {
        await executePayout({
          gameType: "morpion",
          gameId: `morpion-${game.slug}-p1-draw`,
          recipientAddress: p1,
          amountCrc: game.betCrc,
          reason: `Morpion ${game.slug} — nul, remboursement J1`,
        });
      }
      if (p2) {
        await executePayout({
          gameType: "morpion",
          gameId: `morpion-${game.slug}-p2-draw`,
          recipientAddress: p2,
          amountCrc: game.betCrc,
          reason: `Morpion ${game.slug} — nul, remboursement J2`,
        });
      }
      await db.update(morpionGames).set({ payoutStatus: "success", updatedAt: new Date() }).where(eq(morpionGames.id, game.id));
    } else if (winnerAddress) {
      const payoutResult = await executePayout({
        gameType: "morpion",
        gameId: `morpion-${game.slug}-winner`,
        recipientAddress: winnerAddress,
        amountCrc: winAmount,
        reason: `Morpion ${game.slug} — victoire, gain ${winAmount} CRC`,
      });
      await db.update(morpionGames).set({
        payoutStatus: payoutResult.success ? "success" : "failed",
        payoutTxHash: payoutResult.transferTxHash || null,
        updatedAt: new Date(),
      }).where(eq(morpionGames.id, game.id));
    }

    return NextResponse.json({ status: "finished", result, winnerAddress, board: newBoard });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Move failed" }, { status: 500 });
  }
}
