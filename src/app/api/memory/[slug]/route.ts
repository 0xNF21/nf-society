import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { memoryGames } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { executePayout } from "@/lib/payout";

const GRID_CONFIG: Record<string, { cols: number; rows: number; pairs: number }> = {
  easy:   { cols: 4, rows: 3, pairs: 6 },
  medium: { cols: 4, rows: 4, pairs: 8 },
  hard:   { cols: 6, rows: 4, pairs: 12 },
};

// Seeded PRNG — must match client
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const result = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  for (let i = result.length - 1; i > 0; i--) {
    h = ((h << 5) - h + i) | 0;
    const j = Math.abs(h) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function buildGrid(difficulty: string, seed: string): number[] {
  const pairs = GRID_CONFIG[difficulty]?.pairs ?? 8;
  const cards: number[] = [];
  for (let i = 1; i <= pairs; i++) cards.push(i, i);
  return seededShuffle(cards, seed);
}

interface BoardState {
  matched: Record<string, string>; // cardValue -> "player1" | "player2"
  flipped: number[];               // currently flipped card indices (0-1 cards)
  lastFlip?: { indices: number[]; matched: boolean; ts: number }; // for reveal delay
}

function parseBoardState(raw: string): BoardState {
  try {
    const parsed = JSON.parse(raw);
    return {
      matched: parsed.matched || {},
      flipped: parsed.flipped || [],
      lastFlip: parsed.lastFlip || undefined,
    };
  } catch {
    return { matched: {}, flipped: [] };
  }
}

// GET /api/memory/[slug]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const [game] = await db.select().from(memoryGames).where(eq(memoryGames.slug, slug)).limit(1);
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  // Auto-clear stale flipped cards (no-match reveal > 1.5s old)
  if (game.status === "playing") {
    const state = parseBoardState(game.boardState);
    if (state.lastFlip && !state.lastFlip.matched && Date.now() - state.lastFlip.ts > 1500) {
      state.flipped = [];
      state.lastFlip = undefined;
      await db.update(memoryGames).set({
        boardState: JSON.stringify(state),
        updatedAt: new Date(),
      }).where(eq(memoryGames.id, game.id));
      game.boardState = JSON.stringify(state);
    }
  }

  return NextResponse.json(game);
}

// POST /api/memory/[slug] — flip a card
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  try {
    const body = await req.json();
    const { playerAddress, cardIndex, playerToken } = body;

    if (!playerAddress || typeof cardIndex !== "number") {
      return NextResponse.json({ error: "playerAddress and cardIndex required" }, { status: 400 });
    }

    const [game] = await db.select().from(memoryGames).where(eq(memoryGames.slug, slug)).limit(1);
    if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });
    if (game.status !== "playing") return NextResponse.json({ error: "Game not in playing state" }, { status: 400 });

    const addr = playerAddress.toLowerCase();
    const p1 = game.player1Address?.toLowerCase();
    const p2 = game.player2Address?.toLowerCase();
    const isP1 = addr === p1;
    const isP2 = addr === p2;
    if (!isP1 && !isP2) return NextResponse.json({ error: "Not a player" }, { status: 403 });

    if (playerToken) {
      if (isP1 && game.player1Token && game.player1Token !== playerToken) {
        return NextResponse.json({ error: "Invalid player token" }, { status: 403 });
      }
      if (isP2 && game.player2Token && game.player2Token !== playerToken) {
        return NextResponse.json({ error: "Invalid player token" }, { status: 403 });
      }
    }

    const playerKey = isP1 ? "player1" : "player2";
    if (game.currentTurn !== playerKey) {
      return NextResponse.json({ error: "Not your turn" }, { status: 400 });
    }

    const grid = buildGrid(game.difficulty, game.gridSeed);
    const totalCards = grid.length;
    if (cardIndex < 0 || cardIndex >= totalCards) {
      return NextResponse.json({ error: "Invalid card index" }, { status: 400 });
    }

    const state = parseBoardState(game.boardState);

    // Check card isn't already matched
    const cardValue = grid[cardIndex];
    if (state.matched[String(cardValue)]) {
      return NextResponse.json({ error: "Card already matched" }, { status: 400 });
    }

    // Check card isn't already flipped
    if (state.flipped.includes(cardIndex)) {
      return NextResponse.json({ error: "Card already flipped" }, { status: 400 });
    }

    // If there's a stale no-match from last turn, clear it first
    if (state.lastFlip && !state.lastFlip.matched) {
      state.flipped = [];
      state.lastFlip = undefined;
    }

    // Flip the card
    state.flipped.push(cardIndex);

    if (state.flipped.length === 1) {
      // First card flipped — just save
      await db.update(memoryGames).set({
        boardState: JSON.stringify(state),
        updatedAt: new Date(),
      }).where(eq(memoryGames.id, game.id));

      return NextResponse.json({ status: "flipped", flipped: state.flipped });
    }

    // Second card flipped — check match
    const [first, second] = state.flipped;
    const firstValue = grid[first];
    const secondValue = grid[second];
    const isMatch = firstValue === secondValue;

    if (isMatch) {
      // Match! Award pair to current player
      state.matched[String(firstValue)] = playerKey;
      state.flipped = [];
      state.lastFlip = { indices: [first, second], matched: true, ts: Date.now() };

      const newP1Pairs = Object.values(state.matched).filter(v => v === "player1").length;
      const newP2Pairs = Object.values(state.matched).filter(v => v === "player2").length;
      const totalPairs = GRID_CONFIG[game.difficulty]?.pairs ?? 8;

      // Check if game is over
      if (newP1Pairs + newP2Pairs >= totalPairs) {
        // Game finished
        let result: string;
        let winnerAddress: string | null = null;

        if (newP1Pairs > newP2Pairs) {
          result = "player1";
          winnerAddress = game.player1Address;
        } else if (newP2Pairs > newP1Pairs) {
          result = "player2";
          winnerAddress = game.player2Address;
        } else {
          result = "draw";
        }

        await db.update(memoryGames).set({
          boardState: JSON.stringify(state),
          player1Pairs: newP1Pairs,
          player2Pairs: newP2Pairs,
          status: "finished",
          result,
          winnerAddress,
          updatedAt: new Date(),
        }).where(eq(memoryGames.id, game.id));

        // Trigger payout
        const pot = game.betCrc * 2;
        const fee = Math.ceil(pot * game.commissionPct / 100);
        const winAmount = pot - fee;

        try {
          if (result === "draw") {
            if (game.player1Address) {
              await executePayout({
                gameType: "memory",
                gameId: `memory-${game.slug}-p1-draw`,
                recipientAddress: game.player1Address,
                amountCrc: game.betCrc,
                reason: `Memory ${game.slug} — draw, refund P1`,
              });
            }
            if (game.player2Address) {
              await executePayout({
                gameType: "memory",
                gameId: `memory-${game.slug}-p2-draw`,
                recipientAddress: game.player2Address,
                amountCrc: game.betCrc,
                reason: `Memory ${game.slug} — draw, refund P2`,
              });
            }
            await db.update(memoryGames).set({ payoutStatus: "success", updatedAt: new Date() }).where(eq(memoryGames.id, game.id));
          } else if (winnerAddress) {
            const payoutResult = await executePayout({
              gameType: "memory",
              gameId: `memory-${game.slug}-winner`,
              recipientAddress: winnerAddress,
              amountCrc: winAmount,
              reason: `Memory ${game.slug} — win, ${winAmount} CRC`,
            });
            await db.update(memoryGames).set({
              payoutStatus: payoutResult.success ? "success" : "failed",
              payoutTxHash: payoutResult.transferTxHash || null,
              updatedAt: new Date(),
            }).where(eq(memoryGames.id, game.id));
          }
        } catch (err) {
          console.error("[Memory] Payout error:", err);
          await db.update(memoryGames).set({ payoutStatus: "failed", updatedAt: new Date() }).where(eq(memoryGames.id, game.id));
        }

        return NextResponse.json({ status: "finished", result, winnerAddress });
      }

      // Match but game continues — player keeps turn
      await db.update(memoryGames).set({
        boardState: JSON.stringify(state),
        player1Pairs: newP1Pairs,
        player2Pairs: newP2Pairs,
        updatedAt: new Date(),
      }).where(eq(memoryGames.id, game.id));

      return NextResponse.json({ status: "match", pair: firstValue, flipped: [first, second] });
    }

    // No match — switch turn after delay
    const nextTurn = playerKey === "player1" ? "player2" : "player1";
    state.lastFlip = { indices: [first, second], matched: false, ts: Date.now() };

    await db.update(memoryGames).set({
      boardState: JSON.stringify(state),
      currentTurn: nextTurn,
      updatedAt: new Date(),
    }).where(eq(memoryGames.id, game.id));

    return NextResponse.json({ status: "no_match", flipped: [first, second], nextTurn });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Flip failed" }, { status: 500 });
  }
}
