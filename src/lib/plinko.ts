/**
 * Plinko — Pure game logic
 *
 * Rules:
 * - 12 rows of pegs → 13 buckets (0–12)
 * - Ball drops from the top; at each peg row it goes left (0) or right (1)
 * - Final bucket = sum of all right-moves (0 = far left, 12 = far right)
 * - Each bucket has a fixed multiplier (symmetric, high at edges)
 * - Payout = bet × multiplier
 * - RTP ~99.1% (verified via binomial sum)
 *
 * Multiplier table (13 buckets):
 *   [50, 15, 5, 2, 1, 0.5, 0.3, 0.5, 1, 2, 5, 15, 50]
 */

// ── Types ──────────────────────────────────────────────

export type PlinkoState = {
  status: "playing" | "won" | "lost";
  betCrc: number;
  /** Path the ball takes: array of 0 (left) or 1 (right) per row, null until drop */
  ballPath: number[] | null;
  /** Final bucket index (0–12), null until drop */
  finalBucket: number | null;
  /** Multiplier applied, null until drop */
  finalMultiplier: number | null;
};

export type VisibleState = {
  status: PlinkoState["status"];
  betCrc: number;
  ballPath: number[] | null;
  finalBucket: number | null;
  finalMultiplier: number | null;
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

/** Create initial game state (before drop) */
export function createInitialState(betCrc: number): PlinkoState {
  return {
    status: "playing",
    betCrc,
    ballPath: null,
    finalBucket: null,
    finalMultiplier: null,
  };
}

/** Drop the ball — single action, game finishes immediately */
export function dropBall(state: PlinkoState): PlinkoState {
  if (state.status !== "playing") {
    throw new Error("Game is already finished");
  }

  // Generate random path: 12 directions (0=left, 1=right)
  const path: number[] = [];
  for (let i = 0; i < PEG_ROWS; i++) {
    path.push(randomDirection());
  }

  // Final bucket = sum of all right-moves
  const bucket = path.reduce((sum, d) => sum + d, 0);
  const multiplier = MULTIPLIERS[bucket];

  // Won if multiplier >= 1 (gets back at least the bet)
  const won = multiplier >= 1;

  return {
    ...state,
    status: won ? "won" : "lost",
    ballPath: path,
    finalBucket: bucket,
    finalMultiplier: multiplier,
  };
}

/** Calculate payout amount */
export function calculatePayout(state: PlinkoState): number {
  if (state.finalMultiplier !== null && (state.status === "won" || state.status === "lost")) {
    return Math.floor(state.betCrc * state.finalMultiplier * 100) / 100;
  }
  return 0;
}

/** Get visible state — safe to send to client (no hidden info in Plinko) */
export function getVisibleState(state: PlinkoState): VisibleState {
  return {
    status: state.status,
    betCrc: state.betCrc,
    ballPath: state.ballPath,
    finalBucket: state.finalBucket,
    finalMultiplier: state.finalMultiplier,
    payoutCrc: calculatePayout(state),
  };
}

/** Validate an action from the client */
export function isValidAction(action: unknown): action is PlinkoAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  return a.type === "drop";
}
