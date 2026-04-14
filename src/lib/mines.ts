/**
 * Mines — Pure game logic
 *
 * Rules:
 * - 5x5 grid (25 cells)
 * - Player chooses 1-24 mines before game starts
 * - Cells contain either a gem or a mine
 * - Player reveals cells one by one
 * - Each gem revealed increases the multiplier
 * - Player can cash out at any time (after >= 1 gem)
 * - Hitting a mine = game over, lose bet
 * - RTP ~99% (1% house edge)
 *
 * Multiplier formula:
 *   After k gems with m mines on 25 cells:
 *   multiplier = HOUSE_FACTOR * PRODUCT[(25-i)/(25-m-i)] for i=0..k-1
 */

// ── Types ──────────────────────────────────────────────

export type CellState = "hidden" | "gem" | "mine";

export type MinesAction =
  | { type: "reveal"; cellIndex: number }
  | { type: "cashout" };

export type MinesState = {
  /** true = mine, false = gem (25 elements) */
  grid: boolean[];
  /** true = revealed (25 elements) */
  revealed: boolean[];
  mineCount: number;
  gemsRevealed: number;
  status: "playing" | "cashed_out" | "exploded";
  betCrc: number;
  currentMultiplier: number;
  /** Index of the mine that was hit (only set when exploded) */
  explodedIndex: number | null;
};

export type VisibleCell = {
  index: number;
  state: CellState;
  /** true if this is the mine the player clicked (caused explosion) */
  exploded?: boolean;
};

export type VisibleState = {
  cells: VisibleCell[];
  mineCount: number;
  gemsRevealed: number;
  totalGems: number;
  currentMultiplier: number;
  nextMultiplier: number;
  potentialPayout: number;
  status: MinesState["status"];
  betCrc: number;
  canCashout: boolean;
  explodedIndex: number | null;
};

// ── Constants ──────────────────────────────────────────

const GRID_SIZE = 25;
const HOUSE_FACTOR = 0.99;

// ── Functions ──────────────────────────────────────────

/** Calculate the multiplier after k gems revealed with m mines */
export function calculateMultiplier(mineCount: number, gemsRevealed: number): number {
  if (gemsRevealed === 0) return 1.0;
  let product = 1;
  for (let i = 0; i < gemsRevealed; i++) {
    product *= (GRID_SIZE - i) / (GRID_SIZE - mineCount - i);
  }
  return Math.floor(HOUSE_FACTOR * product * 10000) / 10000;
}

/** Calculate the multiplier if the next reveal is a gem */
export function calculateNextMultiplier(state: MinesState): number {
  if (state.status !== "playing") return 0;
  const maxGems = GRID_SIZE - state.mineCount;
  if (state.gemsRevealed >= maxGems) return 0;
  return calculateMultiplier(state.mineCount, state.gemsRevealed + 1);
}

/** Create a shuffled grid with mines placed randomly */
export function createGrid(mineCount: number): boolean[] {
  if (mineCount < 1 || mineCount > 24) {
    throw new Error("Mine count must be between 1 and 24");
  }
  const grid: boolean[] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    grid.push(i < mineCount);
  }
  // Fisher-Yates shuffle
  if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    const { randomInt } = require("crypto") as typeof import("crypto"); // eslint-disable-line
    for (let i = grid.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [grid[i], grid[j]] = [grid[j], grid[i]];
    }
  } else {
    for (let i = grid.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [grid[i], grid[j]] = [grid[j], grid[i]];
    }
  }
  return grid;
}

/** Create initial game state */
export function createInitialState(grid: boolean[], betCrc: number): MinesState {
  const mineCount = grid.filter(Boolean).length;
  return {
    grid,
    revealed: Array(GRID_SIZE).fill(false),
    mineCount,
    gemsRevealed: 0,
    status: "playing",
    betCrc,
    currentMultiplier: 1.0,
    explodedIndex: null,
  };
}

/** Apply an action — returns new state */
export function applyAction(state: MinesState, action: MinesAction): MinesState {
  if (state.status !== "playing") {
    throw new Error("Game is already finished");
  }

  const s: MinesState = {
    ...state,
    grid: [...state.grid],
    revealed: [...state.revealed],
  };

  if (action.type === "cashout") {
    if (s.gemsRevealed < 1) {
      throw new Error("Must reveal at least one gem before cashing out");
    }
    s.status = "cashed_out";
    return s;
  }

  // Reveal action
  const idx = action.cellIndex;
  if (idx < 0 || idx >= GRID_SIZE) {
    throw new Error("Cell index out of bounds");
  }
  if (s.revealed[idx]) {
    throw new Error("Cell already revealed");
  }

  s.revealed[idx] = true;

  if (s.grid[idx]) {
    // Hit a mine
    s.status = "exploded";
    s.explodedIndex = idx;
  } else {
    // Found a gem
    s.gemsRevealed += 1;
    s.currentMultiplier = calculateMultiplier(s.mineCount, s.gemsRevealed);

    // Check if all gems found
    const totalGems = GRID_SIZE - s.mineCount;
    if (s.gemsRevealed >= totalGems) {
      s.status = "cashed_out";
    }
  }

  return s;
}

/** Get visible state — hides mine positions for unrevealed cells */
export function getVisibleState(state: MinesState): VisibleState {
  const showAll = state.status === "exploded" || state.status === "cashed_out";
  const cells: VisibleCell[] = [];

  for (let i = 0; i < GRID_SIZE; i++) {
    const isMine = state.grid[i];
    const isExploded = state.explodedIndex === i;
    if (state.revealed[i]) {
      cells.push({ index: i, state: isMine ? "mine" : "gem", exploded: isExploded || undefined });
    } else if (showAll) {
      cells.push({ index: i, state: isMine ? "mine" : "gem" });
    } else {
      cells.push({ index: i, state: "hidden" });
    }
  }

  const totalGems = GRID_SIZE - state.mineCount;

  return {
    cells,
    explodedIndex: state.explodedIndex,
    mineCount: state.mineCount,
    gemsRevealed: state.gemsRevealed,
    totalGems,
    currentMultiplier: state.currentMultiplier,
    nextMultiplier: calculateNextMultiplier(state),
    potentialPayout: calculatePayout(state),
    status: state.status,
    betCrc: state.betCrc,
    canCashout: state.gemsRevealed >= 1 && state.status === "playing",
  };
}

/** Calculate payout amount */
export function calculatePayout(state: MinesState): number {
  if (state.status === "cashed_out" || (state.status === "playing" && state.gemsRevealed >= 1)) {
    return Math.floor(state.betCrc * state.currentMultiplier * 100) / 100;
  }
  return 0;
}

/** Valid action type guard */
export function isValidAction(action: unknown): action is MinesAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  if (a.type === "cashout") return true;
  if (a.type === "reveal" && typeof a.cellIndex === "number") return true;
  return false;
}
