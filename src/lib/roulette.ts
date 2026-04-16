/**
 * Roulette — Pure game logic
 *
 * Rules:
 * - European roulette: 37 slots (0–36)
 * - Player places bets on numbers, zones, splits, or corners
 * - Each bet type has its own payout based on coverage
 * - RTP ~99% (1% house edge)
 *
 * Payouts (0.99 * 37 / coverage):
 * - Straight (1 number):  x36.63
 * - Split (2 numbers):    x18.315
 * - Corner (4 numbers):   x9.1575
 * - Red/Black/Odd/Even/Low/High (18 numbers): x2.035
 * - Dozen/Column (12 numbers): x3.0525
 */

// ── Types ──────────────────────────────────────────────

export type BetType =
  | "straight" | "split" | "corner"
  | "red" | "black"
  | "odd" | "even"
  | "low" | "high"
  | "dozen1" | "dozen2" | "dozen3"
  | "col1" | "col2" | "col3";

export type RouletteBet = {
  type: BetType;
  number?: number;    // for "straight"
  numbers?: number[]; // for "split" (2) and "corner" (4)
  amount: number;
};

export type RouletteAction = {
  bets: RouletteBet[];
};

export type RouletteState = {
  status: "playing" | "won" | "lost";
  betCrc: number;
  bets: RouletteBet[] | null;
  result: number | null;
  payoutCrc: number;
};

export type VisibleState = {
  status: RouletteState["status"];
  betCrc: number;
  bets: RouletteBet[] | null;
  result: number | null;
  payoutCrc: number;
};

// ── Constants ──────────────────────────────────────────

export const TOTAL_SLOTS = 37;

export const RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
export const BLACK_NUMBERS = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

/** European wheel order (clockwise) */
export const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const HOUSE_FACTOR = 0.99;

/** Payout multiplier per bet type (includes stake) */
export const BET_PAYOUTS: Record<BetType, number> = {
  straight: Math.floor(HOUSE_FACTOR * 37 / 1 * 100) / 100,       // 36.63
  split:    Math.floor(HOUSE_FACTOR * 37 / 2 * 10000) / 10000,    // 18.315
  corner:   Math.floor(HOUSE_FACTOR * 37 / 4 * 10000) / 10000,    // 9.1575
  red:      Math.floor(HOUSE_FACTOR * 37 / 18 * 10000) / 10000,   // 2.035
  black:    Math.floor(HOUSE_FACTOR * 37 / 18 * 10000) / 10000,
  odd:      Math.floor(HOUSE_FACTOR * 37 / 18 * 10000) / 10000,
  even:     Math.floor(HOUSE_FACTOR * 37 / 18 * 10000) / 10000,
  low:      Math.floor(HOUSE_FACTOR * 37 / 18 * 10000) / 10000,
  high:     Math.floor(HOUSE_FACTOR * 37 / 18 * 10000) / 10000,
  dozen1:   Math.floor(HOUSE_FACTOR * 37 / 12 * 10000) / 10000,   // 3.0525
  dozen2:   Math.floor(HOUSE_FACTOR * 37 / 12 * 10000) / 10000,
  dozen3:   Math.floor(HOUSE_FACTOR * 37 / 12 * 10000) / 10000,
  col1:     Math.floor(HOUSE_FACTOR * 37 / 12 * 10000) / 10000,
  col2:     Math.floor(HOUSE_FACTOR * 37 / 12 * 10000) / 10000,
  col3:     Math.floor(HOUSE_FACTOR * 37 / 12 * 10000) / 10000,
};

const ALL_BET_TYPES: BetType[] = [
  "straight", "split", "corner",
  "red", "black", "odd", "even", "low", "high",
  "dozen1", "dozen2", "dozen3", "col1", "col2", "col3",
];

/**
 * Table layout for adjacency checks.
 * Rows top→bottom: [3,6,9,...,36], [2,5,8,...,35], [1,4,7,...,34]
 */
export const TABLE_ROWS: number[][] = [
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

/** Check if two numbers are adjacent on the table (horizontal or vertical) */
export function areAdjacent(a: number, b: number): boolean {
  if (a < 1 || a > 36 || b < 1 || b > 36 || a === b) return false;
  for (let r = 0; r < 3; r++) {
    const row = TABLE_ROWS[r];
    const ia = row.indexOf(a);
    const ib = row.indexOf(b);
    // Same row, adjacent columns
    if (ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1) return true;
    // Same column, adjacent rows
    if (ia >= 0) {
      if (r > 0 && TABLE_ROWS[r - 1][ia] === b) return true;
      if (r < 2 && TABLE_ROWS[r + 1][ia] === b) return true;
    }
  }
  return false;
}

/** Check if four numbers form a valid 2x2 corner on the table */
export function isValidCorner(nums: number[]): boolean {
  if (nums.length !== 4) return false;
  const sorted = [...nums].sort((a, b) => a - b);
  // Find positions in the grid
  const positions: Array<{ r: number; c: number }> = [];
  for (const n of sorted) {
    for (let r = 0; r < 3; r++) {
      const c = TABLE_ROWS[r].indexOf(n);
      if (c >= 0) { positions.push({ r, c }); break; }
    }
  }
  if (positions.length !== 4) return false;
  // Must form a 2x2 block
  const rows = [...new Set(positions.map(p => p.r))].sort();
  const cols = [...new Set(positions.map(p => p.c))].sort();
  return rows.length === 2 && cols.length === 2
    && rows[1] - rows[0] === 1 && cols[1] - cols[0] === 1;
}

// ── Functions ──────────────────────────────────────────

/** Get color of a roulette number */
export function getNumberColor(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  if (RED_NUMBERS.includes(n)) return "red";
  return "black";
}

/** Check if a single bet wins for a given result */
export function isBetWinning(bet: RouletteBet, result: number): boolean {
  switch (bet.type) {
    case "straight": return result === bet.number;
    case "split":    return bet.numbers?.includes(result) ?? false;
    case "corner":   return bet.numbers?.includes(result) ?? false;
    case "red":      return RED_NUMBERS.includes(result);
    case "black":    return BLACK_NUMBERS.includes(result);
    case "odd":      return result > 0 && result % 2 === 1;
    case "even":     return result > 0 && result % 2 === 0;
    case "low":      return result >= 1 && result <= 18;
    case "high":     return result >= 19 && result <= 36;
    case "dozen1":   return result >= 1 && result <= 12;
    case "dozen2":   return result >= 13 && result <= 24;
    case "dozen3":   return result >= 25 && result <= 36;
    case "col1":     return result > 0 && result % 3 === 1;
    case "col2":     return result > 0 && result % 3 === 2;
    case "col3":     return result > 0 && result % 3 === 0;
    default:         return false;
  }
}

/** Generate a random result 0–36 (server: crypto, client: Math.random) */
export function generateResult(): number {
  if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    const { randomInt } = require("crypto") as typeof import("crypto"); // eslint-disable-line
    return randomInt(TOTAL_SLOTS);
  }
  return Math.floor(Math.random() * TOTAL_SLOTS);
}

/** Create initial game state (before spin) */
export function createInitialState(betCrc: number): RouletteState {
  return { status: "playing", betCrc, bets: null, result: null, payoutCrc: 0 };
}

/** Resolve a spin — single action, game finishes immediately */
export function resolveRoll(state: RouletteState, action: RouletteAction): RouletteState {
  if (state.status !== "playing") throw new Error("Game is already finished");

  const { bets } = action;
  if (!bets || bets.length === 0) throw new Error("Must place at least one bet");

  // Validate each bet
  let totalPlaced = 0;
  for (const bet of bets) {
    if (!ALL_BET_TYPES.includes(bet.type)) throw new Error(`Invalid bet type: ${bet.type}`);
    if (typeof bet.amount !== "number" || bet.amount < 1 || !Number.isInteger(bet.amount)) {
      throw new Error(`Invalid bet amount: ${bet.amount}`);
    }
    if (bet.type === "straight") {
      if (bet.number === undefined || bet.number < 0 || bet.number > 36) {
        throw new Error(`Invalid straight bet number: ${bet.number}`);
      }
    }
    if (bet.type === "split") {
      if (!bet.numbers || bet.numbers.length !== 2 || !areAdjacent(bet.numbers[0], bet.numbers[1])) {
        throw new Error("Split bet requires 2 adjacent numbers");
      }
    }
    if (bet.type === "corner") {
      if (!bet.numbers || !isValidCorner(bet.numbers)) {
        throw new Error("Corner bet requires 4 numbers forming a 2x2 block");
      }
    }
    totalPlaced += bet.amount;
  }

  if (totalPlaced > state.betCrc) {
    throw new Error(`Total bets (${totalPlaced}) exceeds bet amount (${state.betCrc})`);
  }

  const result = generateResult();

  // Calculate total payout
  let payoutCrc = 0;
  for (const bet of bets) {
    if (isBetWinning(bet, result)) {
      payoutCrc += Math.floor(bet.amount * BET_PAYOUTS[bet.type] * 100) / 100;
    }
  }
  payoutCrc = Math.floor(payoutCrc * 100) / 100;

  return {
    ...state,
    status: payoutCrc > 0 ? "won" : "lost",
    bets,
    result,
    payoutCrc,
  };
}

/** Calculate payout amount */
export function calculatePayout(state: RouletteState): number {
  return state.payoutCrc;
}

/** Get visible state — safe to send to client */
export function getVisibleState(state: RouletteState): VisibleState {
  return {
    status: state.status,
    betCrc: state.betCrc,
    bets: state.bets,
    result: state.result,
    payoutCrc: state.payoutCrc,
  };
}

/** Validate an action from the client */
export function isValidAction(action: unknown, betCrc: number): action is RouletteAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  if (!Array.isArray(a.bets) || a.bets.length === 0) return false;

  let total = 0;
  for (const bet of a.bets as unknown[]) {
    if (!bet || typeof bet !== "object") return false;
    const b = bet as Record<string, unknown>;
    if (!ALL_BET_TYPES.includes(b.type as BetType)) return false;
    if (typeof b.amount !== "number" || b.amount < 1 || !Number.isInteger(b.amount)) return false;
    if (b.type === "straight") {
      if (typeof b.number !== "number" || b.number < 0 || b.number > 36) return false;
    }
    if (b.type === "split") {
      if (!Array.isArray(b.numbers) || b.numbers.length !== 2) return false;
      if (!areAdjacent(b.numbers[0] as number, b.numbers[1] as number)) return false;
    }
    if (b.type === "corner") {
      if (!Array.isArray(b.numbers) || !isValidCorner(b.numbers as number[])) return false;
    }
    total += b.amount;
  }

  return total > 0 && total <= betCrc;
}
