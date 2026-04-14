/**
 * Dice — Pure game logic
 *
 * Rules:
 * - Virtual 100-sided die (result 0.00–99.99)
 * - Player sets a target (2.00–98.00) and a direction (over/under)
 * - Roll Over target T: win if result > T
 * - Roll Under target T: win if result < T
 * - Result === target is always a loss (house edge)
 * - RTP ~99% (1% house edge)
 *
 * Multiplier formula:
 *   Roll Over T: 99 / (100 - T)
 *   Roll Under T: 99 / T
 */

// ── Types ──────────────────────────────────────────────

export type DiceDirection = "over" | "under";

export type DiceAction = {
  target: number;
  direction: DiceDirection;
};

export type DiceState = {
  status: "playing" | "won" | "lost";
  betCrc: number;
  /** Target set by player (2.00–98.00), null until roll */
  target: number | null;
  /** Direction chosen by player, null until roll */
  direction: DiceDirection | null;
  /** Result of the die roll (0.00–99.99), null until roll */
  result: number | null;
  /** Multiplier applied, null until roll */
  multiplier: number | null;
};

export type VisibleState = {
  status: DiceState["status"];
  betCrc: number;
  target: number | null;
  direction: DiceDirection | null;
  result: number | null;
  multiplier: number | null;
  payoutCrc: number;
};

// ── Constants ──────────────────────────────────────────

const HOUSE_FACTOR = 0.99;
export const MIN_TARGET = 2;
export const MAX_TARGET = 98;

// ── Functions ──────────────────────────────────────────

/** Calculate the multiplier for a given target + direction */
export function calculateMultiplier(target: number, direction: DiceDirection): number {
  if (direction === "over") {
    const winZone = 100 - target;
    if (winZone <= 0) return 0;
    return Math.floor((HOUSE_FACTOR * 100 / winZone) * 10000) / 10000;
  } else {
    const winZone = target;
    if (winZone <= 0) return 0;
    return Math.floor((HOUSE_FACTOR * 100 / winZone) * 10000) / 10000;
  }
}

/** Calculate the win chance (0–100) for a given target + direction */
export function calculateWinChance(target: number, direction: DiceDirection): number {
  if (direction === "over") {
    return Math.round((100 - target) * 100) / 100;
  } else {
    return Math.round(target * 100) / 100;
  }
}

/** Generate a random result 0.00–99.99 (server: crypto, client: Math.random) */
export function generateResult(): number {
  if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    const { randomInt } = require("crypto") as typeof import("crypto"); // eslint-disable-line
    return randomInt(10000) / 100; // 0.00 → 99.99
  }
  return Math.floor(Math.random() * 10000) / 100;
}

/** Create initial game state (before roll) */
export function createInitialState(betCrc: number): DiceState {
  return {
    status: "playing",
    betCrc,
    target: null,
    direction: null,
    result: null,
    multiplier: null,
  };
}

/** Resolve a roll — single action, game finishes immediately */
export function resolveRoll(state: DiceState, action: DiceAction): DiceState {
  if (state.status !== "playing") {
    throw new Error("Game is already finished");
  }

  const { target, direction } = action;

  // Validate target range
  if (target < MIN_TARGET || target > MAX_TARGET) {
    throw new Error(`Target must be between ${MIN_TARGET} and ${MAX_TARGET}`);
  }

  // Validate direction
  if (direction !== "over" && direction !== "under") {
    throw new Error("Direction must be 'over' or 'under'");
  }

  const result = generateResult();
  const multiplier = calculateMultiplier(target, direction);

  // Determine win/loss — result === target is always a loss
  let won = false;
  if (direction === "over") {
    won = result > target;
  } else {
    won = result < target;
  }

  return {
    ...state,
    status: won ? "won" : "lost",
    target,
    direction,
    result,
    multiplier,
  };
}

/** Calculate payout amount */
export function calculatePayout(state: DiceState): number {
  if (state.status === "won" && state.multiplier !== null) {
    return Math.floor(state.betCrc * state.multiplier * 100) / 100;
  }
  return 0;
}

/** Get visible state — safe to send to client (no hidden info in Dice) */
export function getVisibleState(state: DiceState): VisibleState {
  return {
    status: state.status,
    betCrc: state.betCrc,
    target: state.target,
    direction: state.direction,
    result: state.result,
    multiplier: state.multiplier,
    payoutCrc: calculatePayout(state),
  };
}

/** Validate an action from the client */
export function isValidAction(action: unknown): action is DiceAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  if (typeof a.target !== "number") return false;
  if (a.target < MIN_TARGET || a.target > MAX_TARGET) return false;
  if (a.direction !== "over" && a.direction !== "under") return false;
  return true;
}
