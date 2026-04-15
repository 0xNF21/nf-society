/**
 * Demurrage Dash — Pure game logic (crash game)
 *
 * Rules:
 * - A multiplier grows exponentially from 1.00×
 * - Player must cash out ("harvest") before the crash point
 * - Crash point generated with 99% RTP formula
 * - If player harvests at multiplier M <= crashPoint → win (payout = bet × M)
 * - If multiplier reaches crashPoint before harvest → loss (plant wilts)
 *
 * RTP ~99% (1% house edge)
 */

// ── Types ──────────────────────────────────────────────

export type CrashDashAction =
  | { type: "cashout"; multiplier: number }
  | { type: "crash" };

export type CrashDashState = {
  status: "playing" | "cashed_out" | "crashed";
  betCrc: number;
  /** Secret crash point — hidden from client while playing */
  crashPoint: number;
  /** Multiplier at which player cashed out (null if crashed) */
  cashoutMultiplier: number | null;
};

export type CrashDashVisibleState = {
  status: CrashDashState["status"];
  betCrc: number;
  /** Only revealed after game ends */
  crashPoint: number | null;
  cashoutMultiplier: number | null;
  payoutCrc: number;
};

// ── Constants ──────────────────────────────────────────

const HOUSE_FACTOR = 0.99;

/**
 * Growth rate for the exponential curve.
 * ~1.5× at 7s, ~2× at 11.5s, ~5× at 27s, ~10× at 38s
 */
const GROWTH_RATE = 0.00006;

// ── Functions ──────────────────────────────────────────

/**
 * Generate a crash point with 99% RTP.
 * Uses crypto.randomInt on server, Math.random on client.
 */
export function generateCrashPoint(): number {
  let r: number;
  if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    const { randomInt } = require("crypto") as typeof import("crypto"); // eslint-disable-line
    r = randomInt(10000) / 10000; // 0.0000 → 0.9999
  } else {
    r = Math.random();
  }

  // 1% instant crash (house edge)
  if (r < 0.01) return 1.00;

  const cp = Math.floor((HOUSE_FACTOR / r) * 100) / 100;
  return Math.max(1.01, cp);
}

/** Create initial game state */
export function createInitialState(crashPoint: number, betCrc: number): CrashDashState {
  return {
    status: "playing",
    betCrc,
    crashPoint,
    cashoutMultiplier: null,
  };
}

/** Apply a cashout or crash action */
export function applyAction(state: CrashDashState, action: CrashDashAction): CrashDashState {
  if (state.status !== "playing") {
    throw new Error("Game is already finished");
  }

  if (action.type === "crash") {
    return { ...state, status: "crashed", cashoutMultiplier: null };
  }

  // Cashout — validate multiplier is within crash point
  if (action.multiplier < 1.00) {
    throw new Error("Multiplier must be >= 1.00");
  }

  if (action.multiplier <= state.crashPoint) {
    return {
      ...state,
      status: "cashed_out",
      cashoutMultiplier: Math.floor(action.multiplier * 100) / 100,
    };
  }

  // Multiplier exceeds crash point — player already crashed
  return { ...state, status: "crashed", cashoutMultiplier: null };
}

/** Calculate payout amount */
export function calculatePayout(state: CrashDashState): number {
  if (state.status === "cashed_out" && state.cashoutMultiplier !== null) {
    return Math.floor(state.betCrc * state.cashoutMultiplier * 100) / 100;
  }
  return 0;
}

/** Get visible state — hides crashPoint while game is playing */
export function getVisibleState(state: CrashDashState): CrashDashVisibleState {
  return {
    status: state.status,
    betCrc: state.betCrc,
    crashPoint: state.status === "playing" ? null : state.crashPoint,
    cashoutMultiplier: state.cashoutMultiplier,
    payoutCrc: calculatePayout(state),
  };
}

/** Validate a cashout action from the client */
export function isValidCashout(action: unknown): action is CrashDashAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  if (a.type === "crash") return true;
  if (a.type !== "cashout") return false;
  if (typeof a.multiplier !== "number") return false;
  if (a.multiplier < 1.00) return false;
  return true;
}

/**
 * Calculate multiplier at a given elapsed time (ms).
 * Exponential growth: e^(t * GROWTH_RATE)
 * Used by client animation loop.
 */
export function getMultiplierAtTick(elapsedMs: number): number {
  return Math.floor(Math.pow(Math.E, elapsedMs * GROWTH_RATE) * 100) / 100;
}

/** Danger level for plant color transitions */
export function getDangerLevel(multiplier: number): "safe" | "warning" | "danger" {
  if (multiplier >= 12) return "danger";
  if (multiplier >= 5) return "warning";
  return "safe";
}

/**
 * Vitality percentage — drains faster at higher multipliers.
 * At 1× = 100%, at 2× = 50%, at 5× = 20%, at 10× = 10%
 */
export function getVitalityPct(multiplier: number): number {
  if (multiplier <= 1) return 100;
  return Math.max(0, Math.floor((1 / multiplier) * 10000) / 100);
}
