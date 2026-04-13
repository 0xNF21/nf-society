/**
 * Coin Flip — Pure game logic
 *
 * Rules:
 * - Player picks heads or tails
 * - Fair coin flip (crypto-secure on server, Math.random on client/demo)
 * - Win pays 1.96x (RTP 98%, house edge 2%)
 */

// ── Types ──────────────────────────────────────────────

export type CoinSide = "heads" | "tails";

export type CoinFlipResult = {
  playerChoice: CoinSide;
  coinResult: CoinSide;
  outcome: "win" | "loss";
  betCrc: number;
  payoutCrc: number;
};

// ── Constants ──────────────────────────────────────────

/** Win multiplier: 1.96x → RTP 98% (50% * 1.96 = 0.98) */
export const PAYOUT_MULTIPLIER = 1.96;

// ── Functions ──────────────────────────────────────────

/** Flip a coin — crypto-secure on server, Math.random on client (demo only) */
export function flipCoin(): CoinSide {
  if (typeof globalThis.process !== "undefined" && globalThis.process.versions?.node) {
    // Server: use crypto.randomInt for true randomness
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { randomInt } = require("crypto") as typeof import("crypto");
    return randomInt(2) === 0 ? "heads" : "tails";
  }
  // Client (demo mode only): Math.random is fine for simulation
  return Math.random() < 0.5 ? "heads" : "tails";
}

/** Calculate the payout for a winning bet */
export function calculatePayout(betCrc: number): number {
  return Math.round(betCrc * PAYOUT_MULTIPLIER * 100) / 100;
}

/** Resolve a coin flip: flip the coin, determine outcome and payout */
export function resolveCoinFlip(playerChoice: CoinSide, betCrc: number): CoinFlipResult {
  const coinResult = flipCoin();
  const won = playerChoice === coinResult;
  return {
    playerChoice,
    coinResult,
    outcome: won ? "win" : "loss",
    betCrc,
    payoutCrc: won ? calculatePayout(betCrc) : 0,
  };
}

/** Type guard: check if a string is a valid coin side */
export function isValidChoice(choice: string): choice is CoinSide {
  return choice === "heads" || choice === "tails";
}
