/**
 * Pierre-Feuille-Ciseaux — Pure game logic (no DB/API dependencies)
 */

export type Move = "pierre" | "feuille" | "ciseaux";

export type RoundResult = {
  p1: Move;
  p2: Move;
  winner: "p1" | "p2" | "draw";
};

export type PfcState = {
  rounds: RoundResult[];
  currentRound: { p1?: Move; p2?: Move };
  bestOf: 3 | 5;
};

export const MOVES: Move[] = ["pierre", "feuille", "ciseaux"];

export const MOVE_EMOJI: Record<Move, string> = {
  pierre: "🪨",
  feuille: "📄",
  ciseaux: "✂️",
};

/** Determine who wins a single round */
export function resolveRound(p1: Move, p2: Move): "p1" | "p2" | "draw" {
  if (p1 === p2) return "draw";
  if (
    (p1 === "pierre" && p2 === "ciseaux") ||
    (p1 === "feuille" && p2 === "pierre") ||
    (p1 === "ciseaux" && p2 === "feuille")
  ) {
    return "p1";
  }
  return "p2";
}

/** Get current score from completed rounds (draws don't count) */
export function getScore(state: PfcState): { p1: number; p2: number } {
  let p1 = 0;
  let p2 = 0;
  for (const r of state.rounds) {
    if (r.winner === "p1") p1++;
    else if (r.winner === "p2") p2++;
  }
  return { p1, p2 };
}

/** How many rounds needed to win */
export function winsNeeded(bestOf: 3 | 5): number {
  return bestOf === 3 ? 2 : 3;
}

/** Get the overall winner, or null if game is still ongoing */
export function getWinner(state: PfcState): "p1" | "p2" | null {
  const score = getScore(state);
  const needed = winsNeeded(state.bestOf);
  if (score.p1 >= needed) return "p1";
  if (score.p2 >= needed) return "p2";
  return null;
}

/** Is the game over? */
export function isGameOver(state: PfcState): boolean {
  return getWinner(state) !== null;
}

/** Create initial game state */
export function createInitialState(bestOf: 3 | 5 = 3): PfcState {
  return {
    rounds: [],
    currentRound: {},
    bestOf,
  };
}

/** Validate a move string */
export function isValidMove(move: string): move is Move {
  return MOVES.includes(move as Move);
}

/** Bot move: random */
export function getBotMove(): Move {
  return MOVES[Math.floor(Math.random() * 3)];
}
