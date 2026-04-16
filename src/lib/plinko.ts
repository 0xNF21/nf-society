/**
 * Plinko — Pure game logic (multi-ball)
 *
 * Rules:
 * - 12 rows of pegs → 13 buckets (0–12)
 * - Player pays N CRC → gets N balls (1 CRC per ball)
 * - Each ball drops independently: at each peg row it goes left (0) or right (1)
 * - Final bucket = sum of all right-moves (0 = far left, 12 = far right)
 * - Each bucket has a fixed multiplier (symmetric, high at edges)
 * - Total payout = sum of (1 CRC × multiplier) for each ball
 * - RTP ~99.1% per ball (verified via binomial sum)
 *
 * Multiplier table (13 buckets):
 *   [50, 15, 5, 2, 1, 0.5, 0.3, 0.5, 1, 2, 5, 15, 50]
 */

// ── Types ──────────────────────────────────────────────

/** Result of a single ball drop */
export type BallResult = {
  path: number[];      // array of 0 (left) or 1 (right), length = PEG_ROWS
  bucket: number;      // final bucket index (0–12)
  multiplier: number;  // multiplier for this ball
};

export type PlinkoState = {
  status: "playing" | "won" | "lost";
  betCrc: number;              // total CRC paid (= number of balls)
  ballCount: number;           // number of balls
  balls: BallResult[];         // results per ball (empty before drop)
  totalMultiplier: number | null;  // sum of all multipliers, null until drop
};

export type VisibleState = {
  status: PlinkoState["status"];
  betCrc: number;
  ballCount: number;
  balls: BallResult[];
  totalMultiplier: number | null;
  payoutCrc: number;
};

export type PlinkoAction = {
  type: "drop";
};

// ── Constants ──────────────────────────────────────────

export const PEG_ROWS = 12;
export const BUCKET_COUNT = PEG_ROWS + 1; // 13

/**
 * Multipliers per bucket (symmetric).
 * Index = number of right-moves (0 = far left, 12 = far right).
 *
 * RTP verification (binomial distribution, 12 rows):
 *   sum over k=0..12 of C(12,k)/4096 * M[k]
 * = 2*(1*50 + 12*15 + 66*5 + 220*2 + 495*1 + 792*0.5)/4096 + 924*0.3/4096
 * = (3782 + 277.2) / 4096
 * = 0.9910 → ~99.1% RTP ✓
 */
export const MULTIPLIERS: number[] = [
  50, 15, 5, 2, 1, 0.5, 0.3, 0.5, 1, 2, 5, 15, 50,
];

// ── Functions ──────────────────────────────────────────

/** Generate a single random direction: 0 (left) or 1 (right) */
function randomDirection(): number {
  if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    const { randomInt } = require("crypto") as typeof import("crypto"); // eslint-disable-line
    return randomInt(2); // 0 or 1
  }
  return Math.random() < 0.5 ? 0 : 1;
}

/** Drop a single ball, return its result */
function dropOneBall(): BallResult {
  const path: number[] = [];
  for (let i = 0; i < PEG_ROWS; i++) {
    path.push(randomDirection());
  }
  const bucket = path.reduce((sum, d) => sum + d, 0);
  return { path, bucket, multiplier: MULTIPLIERS[bucket] };
}

/** Create initial game state (before drop) */
export function createInitialState(betCrc: number): PlinkoState {
  return {
    status: "playing",
    betCrc,
    ballCount: betCrc, // 1 CRC per ball
    balls: [],
    totalMultiplier: null,
  };
}

/** Drop all balls at once — single action, game finishes immediately */
export function dropAllBalls(state: PlinkoState): PlinkoState {
  if (state.status !== "playing") {
    throw new Error("Game is already finished");
  }

  const balls: BallResult[] = [];
  for (let i = 0; i < state.ballCount; i++) {
    balls.push(dropOneBall());
  }

  const totalMult = Math.round(balls.reduce((sum, b) => sum + b.multiplier, 0) * 10000) / 10000;
  const totalPayout = Math.floor(totalMult * 100) / 100; // 1 CRC per ball × multiplier
  const won = totalPayout >= state.betCrc;

  return {
    ...state,
    status: won ? "won" : "lost",
    balls,
    totalMultiplier: totalMult,
  };
}

// Legacy single-ball (kept for compatibility, used in demo for single-ball preview)
export function dropBall(state: PlinkoState): PlinkoState {
  return dropAllBalls(state);
}

/** Calculate payout amount — sum of all ball multipliers × 1 CRC */
export function calculatePayout(state: PlinkoState): number {
  if (state.totalMultiplier !== null && (state.status === "won" || state.status === "lost")) {
    return Math.floor(state.totalMultiplier * 100) / 100;
  }
  return 0;
}

/** Get visible state — safe to send to client */
export function getVisibleState(state: PlinkoState): VisibleState {
  return {
    status: state.status,
    betCrc: state.betCrc,
    ballCount: state.ballCount,
    balls: state.balls,
    totalMultiplier: state.totalMultiplier,
    payoutCrc: calculatePayout(state),
  };
}

/** Validate an action from the client */
export function isValidAction(action: unknown): action is PlinkoAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  return a.type === "drop";
}
