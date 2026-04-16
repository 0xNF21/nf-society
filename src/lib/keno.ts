/**
 * Keno — Pure game logic
 *
 * Rules:
 * - Grid of 40 numbers (1–40)
 * - Player picks 1–10 numbers
 * - 10 numbers drawn at random
 * - Payout based on how many picks match draws (hits)
 * - RTP ~99% (HOUSE_FACTOR = 0.99)
 *
 * Pay table calculated via hypergeometric distribution:
 *   P(k hits | n picks) = C(n,k) * C(40-n, 10-k) / C(40, 10)
 *   Multipliers set so expected value = 0.99 * bet for each pick count
 */

// ── Types ──────────────────────────────────────────────

export type KenoAction = {
  type: "draw";
  picks: number[];
};

export type KenoState = {
  status: "playing" | "won" | "lost";
  betCrc: number;
  pickCount: number;
  /** Player's selected numbers (filled on draw) */
  picks: number[];
  /** 10 drawn numbers (filled on draw) */
  draws: number[];
  /** Numbers that match picks & draws */
  hits: number[];
  /** Multiplier applied (null until drawn) */
  multiplier: number | null;
  gridSize: number;
  drawCount: number;
};

export type VisibleState = {
  status: KenoState["status"];
  betCrc: number;
  pickCount: number;
  picks: number[];
  draws: number[];
  hits: number[];
  multiplier: number | null;
  payoutCrc: number;
  gridSize: number;
  drawCount: number;
};

// ── Constants ──────────────────────────────────────────

export const GRID_SIZE = 40;
export const DRAW_COUNT = 10;
export const MAX_PICKS = 10;
const HOUSE_FACTOR = 0.99;

// ── Pay table ──────────────────────────────────────────
// PAY_TABLE[pickCount][hitCount] = multiplier
// Computed so that for each pickCount:
//   sum over k: P(k | pickCount) * PAY_TABLE[pickCount][k] ≈ 0.99

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  if (k > n - k) k = n - k;
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return Math.round(result);
}

/** Probability of exactly k hits when picking n numbers from GRID_SIZE, drawing DRAW_COUNT */
function hitProbability(n: number, k: number): number {
  return (comb(n, k) * comb(GRID_SIZE - n, DRAW_COUNT - k)) / comb(GRID_SIZE, DRAW_COUNT);
}

/**
 * Build pay table for a given pick count.
 * Strategy: assign escalating multipliers to winning tiers,
 * then scale all multipliers so total RTP = HOUSE_FACTOR.
 */
function buildPayTable(): Record<number, Record<number, number>> {
  // Minimum hits required to win for each pick count
  // Based on standard 40-Ball Keno (Gamesys / Wizard of Odds reference)
  const minHits: Record<number, number> = {
    1: 1, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 7: 3, 8: 3, 9: 3, 10: 4,
  };

  // Raw payout ratios derived from real 40-Ball Keno pay tables,
  // then auto-scaled to 99% RTP. Each array starts at minHits.
  const rawRatios: Record<number, number[]> = {
    1:  [1],                                          // 1h
    2:  [1],                                             // 2h (all-or-nothing)
    3:  [1, 4.8],                                     // 2h, 3h
    4:  [1, 5, 31],                                   // 2h, 3h, 4h
    5:  [1, 5, 25, 125],                              // 2h, 3h, 4h, 5h
    6:  [1, 2, 10, 50, 1000],                         // 2h-6h
    7:  [1, 4, 12.5, 125, 1500],                      // 3h-7h (jackpot > 6p)
    8:  [1, 4, 8, 250, 1000, 5000],                   // 3h-8h
    9:  [1, 2, 7, 25, 500, 2500, 10000],              // 3h-9h (5h ratio < 8p for monotonicity)
    10: [1, 4, 12.5, 125, 625, 5000, 10000],          // 4h-10h
  };

  const table: Record<number, Record<number, number>> = {};

  for (let n = 1; n <= MAX_PICKS; n++) {
    const min = minHits[n];
    const ratios = rawRatios[n];
    table[n] = {};

    // Set losing tiers to 0
    for (let k = 0; k < min; k++) {
      table[n][k] = 0;
    }

    // Compute EV of raw ratios to find scaling factor
    let rawEV = 0;
    for (let i = 0; i < ratios.length; i++) {
      const k = min + i;
      if (k > n || k > DRAW_COUNT) break;
      rawEV += hitProbability(n, k) * ratios[i];
    }

    // Scale so total EV = HOUSE_FACTOR
    const scale = rawEV > 0 ? HOUSE_FACTOR / rawEV : 0;

    for (let i = 0; i < ratios.length; i++) {
      const k = min + i;
      if (k > n || k > DRAW_COUNT) break;
      // Floor to 2 decimals for clean display
      table[n][k] = Math.floor(ratios[i] * scale * 100) / 100;
    }
  }

  return table;
}

export const PAY_TABLE = buildPayTable();

// ── Functions ──────────────────────────────────────────

/** Get multiplier for given pick count and hit count */
export function calculateMultiplier(pickCount: number, hitCount: number): number {
  const row = PAY_TABLE[pickCount];
  if (!row) return 0;
  return row[hitCount] ?? 0;
}

/** Get the full pay table row for a pick count (for UI display) */
export function getPayTableRow(pickCount: number): Array<{ hits: number; multiplier: number }> {
  const row = PAY_TABLE[pickCount];
  if (!row) return [];
  const result: Array<{ hits: number; multiplier: number }> = [];
  for (let k = 0; k <= pickCount && k <= DRAW_COUNT; k++) {
    result.push({ hits: k, multiplier: row[k] ?? 0 });
  }
  return result;
}

/** Generate DRAW_COUNT unique random numbers from 1 to GRID_SIZE (crypto-secure on server) */
export function generateDraws(): number[] {
  const numbers: number[] = [];
  const used = new Set<number>();

  if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    const { randomInt } = require("crypto") as typeof import("crypto"); // eslint-disable-line
    while (numbers.length < DRAW_COUNT) {
      const n = randomInt(1, GRID_SIZE + 1);
      if (!used.has(n)) {
        used.add(n);
        numbers.push(n);
      }
    }
  } else {
    // Client-side (demo): Math.random
    while (numbers.length < DRAW_COUNT) {
      const n = Math.floor(Math.random() * GRID_SIZE) + 1;
      if (!used.has(n)) {
        used.add(n);
        numbers.push(n);
      }
    }
  }

  return numbers;
}

/** Create initial game state (before picks submitted) */
export function createInitialState(betCrc: number, pickCount: number): KenoState {
  return {
    status: "playing",
    betCrc,
    pickCount,
    picks: [],
    draws: [],
    hits: [],
    multiplier: null,
    gridSize: GRID_SIZE,
    drawCount: DRAW_COUNT,
  };
}

/** Resolve the draw — single action, game finishes immediately */
export function resolveDraw(state: KenoState, action: KenoAction): KenoState {
  if (state.status !== "playing") {
    throw new Error("Game is already finished");
  }

  const { picks } = action;

  // Validate picks count
  if (picks.length !== state.pickCount) {
    throw new Error(`Expected ${state.pickCount} picks, got ${picks.length}`);
  }

  // Validate each pick is in range and unique
  const pickSet = new Set<number>();
  for (const p of picks) {
    if (!Number.isInteger(p) || p < 1 || p > GRID_SIZE) {
      throw new Error(`Invalid pick: ${p}. Must be 1–${GRID_SIZE}`);
    }
    if (pickSet.has(p)) {
      throw new Error(`Duplicate pick: ${p}`);
    }
    pickSet.add(p);
  }

  // Generate draws
  const draws = generateDraws();
  const drawSet = new Set(draws);

  // Calculate hits
  const hits = picks.filter((p) => drawSet.has(p));
  const multiplier = calculateMultiplier(state.pickCount, hits.length);
  const won = multiplier > 0;

  return {
    ...state,
    status: won ? "won" : "lost",
    picks: [...picks],
    draws,
    hits,
    multiplier,
  };
}

/** Calculate payout amount */
export function calculatePayout(state: KenoState): number {
  if (state.status === "won" && state.multiplier !== null && state.multiplier > 0) {
    return Math.floor(state.betCrc * state.multiplier * 100) / 100;
  }
  return 0;
}

/** Get visible state — safe to send to client (everything visible in Keno after draw) */
export function getVisibleState(state: KenoState): VisibleState {
  return {
    status: state.status,
    betCrc: state.betCrc,
    pickCount: state.pickCount,
    picks: state.picks,
    draws: state.draws,
    hits: state.hits,
    multiplier: state.multiplier,
    payoutCrc: calculatePayout(state),
    gridSize: state.gridSize,
    drawCount: state.drawCount,
  };
}

/** Validate an action from the client */
export function isValidAction(action: unknown): action is KenoAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  if (a.type !== "draw") return false;
  if (!Array.isArray(a.picks)) return false;
  if (a.picks.length < 1 || a.picks.length > MAX_PICKS) return false;
  for (const p of a.picks) {
    if (typeof p !== "number" || !Number.isInteger(p) || p < 1 || p > GRID_SIZE) return false;
  }
  // Check uniqueness
  if (new Set(a.picks).size !== a.picks.length) return false;
  return true;
}
