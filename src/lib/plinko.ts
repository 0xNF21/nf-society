/**
 * Plinko — Pure game logic (flexible bet + drop-one-at-a-time + cashout)
 *
 * Rules:
 * - Player pays totalBet CRC and chooses ballValue (CRC per ball)
 * - Ball count = totalBet / ballValue
 * - Each drop: 1 ball falls, payout += ballValue × multiplier
 * - Cashout anytime: return (remaining_balls × ballValue) + accumulated_payout
 * - Auto-finish when all balls dropped
 * - 12 rows of pegs → 13 buckets (0–12), binomial distribution
 * - RTP ~99.1% per ball (cashout of unused balls is 100% refunded)
 *
 * Multiplier table (13 buckets):
 *   [50, 15, 5, 2, 1, 0.5, 0.3, 0.5, 1, 2, 5, 15, 50]
 */

// ── Types ──────────────────────────────────────────────

export type BallResult = {
  path: number[];      // 0 (left) / 1 (right) per peg row
  bucket: number;      // 0–12
  multiplier: number;  // multiplier for this ball
};

export type PlinkoState = {
  status: "playing" | "cashed_out" | "finished";
  totalBet: number;          // CRC total paid
  ballValue: number;         // CRC per ball
  ballCount: number;         // total balls available (totalBet / ballValue)
  balls: BallResult[];       // balls already dropped
  accumulatedPayout: number; // sum of (ballValue × multiplier) of dropped balls
};

export type VisibleState = {
  status: PlinkoState["status"];
  totalBet: number;
  ballValue: number;
  ballCount: number;
  ballsRemaining: number;
  balls: BallResult[];
  accumulatedPayout: number;
  cashoutAmount: number;  // what player would get if cashout NOW
  finalPayout: number;    // actual payout (0 if still playing)
};

export type PlinkoAction = { type: "drop" } | { type: "cashout" };

// ── Constants ──────────────────────────────────────────

export const PEG_ROWS = 12;
export const BUCKET_COUNT = PEG_ROWS + 1; // 13

/** RTP ~99.1% per ball (verified via binomial distribution) */
export const MULTIPLIERS: number[] = [
  50, 15, 5, 2, 1, 0.5, 0.3, 0.5, 1, 2, 5, 15, 50,
];

// ── Helpers ──────────────────────────────────────────

function randomDirection(): number {
  if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    const { randomInt } = require("crypto") as typeof import("crypto"); // eslint-disable-line
    return randomInt(2);
  }
  return Math.random() < 0.5 ? 0 : 1;
}

function dropRandomBall(): BallResult {
  const path: number[] = [];
  for (let i = 0; i < PEG_ROWS; i++) path.push(randomDirection());
  const bucket = path.reduce((s, d) => s + d, 0);
  return { path, bucket, multiplier: MULTIPLIERS[bucket] };
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

// ── Functions ──────────────────────────────────────────

/** Create initial game state before any drops */
export function createInitialState(totalBet: number, ballValue: number): PlinkoState {
  if (ballValue <= 0) throw new Error("ballValue must be > 0");
  if (totalBet <= 0) throw new Error("totalBet must be > 0");
  const ballCount = Math.floor(totalBet / ballValue);
  if (ballCount <= 0) throw new Error("totalBet must be >= ballValue");
  return {
    status: "playing",
    totalBet,
    ballValue,
    ballCount,
    balls: [],
    accumulatedPayout: 0,
  };
}

/** Drop N balls at once. Auto-finishes when last ball is dropped. N defaults to 1. */
export function dropBalls(state: PlinkoState, count: number = 1): PlinkoState {
  if (state.status !== "playing") throw new Error("Game is not in playing state");
  if (count < 1) throw new Error("count must be >= 1");
  const remaining = state.ballCount - state.balls.length;
  if (remaining < 1) throw new Error("No balls remaining");

  const actualCount = Math.min(count, remaining);
  const newBalls = [...state.balls];
  let accumulated = state.accumulatedPayout;

  for (let i = 0; i < actualCount; i++) {
    const ball = dropRandomBall();
    newBalls.push(ball);
    accumulated = round2(accumulated + state.ballValue * ball.multiplier);
  }

  const isLast = newBalls.length >= state.ballCount;

  return {
    ...state,
    balls: newBalls,
    accumulatedPayout: accumulated,
    status: isLast ? "finished" : "playing",
  };
}

/** Drop one ball — convenience wrapper. Auto-finishes when last ball is dropped. */
export function dropOneBall(state: PlinkoState): PlinkoState {
  if (state.status !== "playing") throw new Error("Game is not in playing state");
  if (state.balls.length >= state.ballCount) throw new Error("No balls remaining");

  const newBall = dropRandomBall();
  const newBalls = [...state.balls, newBall];
  const newAccumulated = round2(state.accumulatedPayout + state.ballValue * newBall.multiplier);
  const isLast = newBalls.length >= state.ballCount;

  return {
    ...state,
    balls: newBalls,
    accumulatedPayout: newAccumulated,
    status: isLast ? "finished" : "playing",
  };
}

/** End the game early, remaining balls are refunded */
export function cashout(state: PlinkoState): PlinkoState {
  if (state.status !== "playing") throw new Error("Game is not in playing state");
  return { ...state, status: "cashed_out" };
}

/** Calculate payout based on current state */
export function calculatePayout(state: PlinkoState): number {
  if (state.status === "playing") return 0;
  if (state.status === "cashed_out") {
    const remaining = state.ballCount - state.balls.length;
    return round2(state.accumulatedPayout + remaining * state.ballValue);
  }
  // finished
  return round2(state.accumulatedPayout);
}

/** Potential cashout amount (used during play) */
export function calculateCashoutAmount(state: PlinkoState): number {
  const remaining = state.ballCount - state.balls.length;
  return round2(state.accumulatedPayout + remaining * state.ballValue);
}

/** Get visible state — safe to send to client */
export function getVisibleState(state: PlinkoState): VisibleState {
  return {
    status: state.status,
    totalBet: state.totalBet,
    ballValue: state.ballValue,
    ballCount: state.ballCount,
    ballsRemaining: state.ballCount - state.balls.length,
    balls: state.balls,
    accumulatedPayout: state.accumulatedPayout,
    cashoutAmount: calculateCashoutAmount(state),
    finalPayout: calculatePayout(state),
  };
}

/** Validate an action from the client */
export function isValidAction(action: unknown): action is PlinkoAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  return a.type === "drop" || a.type === "cashout";
}
