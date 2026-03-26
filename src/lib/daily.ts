import crypto from "crypto";
import { keccakHex } from "./hash";
import { db } from "./db";
import { jackpotPool } from "./db/schema";
import { sql, and } from "drizzle-orm";
import { getSafeCrcBalance } from "./payout";
import { ethers } from "ethers";

// ─── Token ────────────────────────────────────────────
export function generateDailyToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `DAILY-${code}`;
}

// Re-export types from shared (client-safe) module
import type { ScratchResult, SpinResult } from "./daily-shared";
export type { ScratchResult, SpinResult } from "./daily-shared";

// ─── Scratch Card Probabilities (RTP 98%) ─────────────
const SCRATCH_TABLE = [
  { cumProb: 0.20, type: "nothing",   label: "Rien",         crcValue: 0,  xpValue: 0,   symbol: "💨" },
  { cumProb: 0.35, type: "xp_50",     label: "+50 XP",       crcValue: 0,  xpValue: 50,  symbol: "⭐" },
  { cumProb: 0.68, type: "refund",    label: "Remboursé",    crcValue: 1,  xpValue: 0,   symbol: "🪙" },
  { cumProb: 0.812,type: "xp_100",    label: "+100 XP",      crcValue: 0,  xpValue: 100, symbol: "🌟" },
  { cumProb: 0.952,type: "crc_2",     label: "+2 CRC",       crcValue: 2,  xpValue: 0,   symbol: "💰" },
  { cumProb: 0.992,type: "streak_x2", label: "Streak x2",    crcValue: 0,  xpValue: 0,   symbol: "🔥" },
  { cumProb: 1.022,type: "crc_5",     label: "+5 CRC",       crcValue: 5,  xpValue: 0,   symbol: "💎" },
  { cumProb: 1.0,  type: "crc_20",    label: "+20 CRC",      crcValue: 20, xpValue: 0,   symbol: "👑" },
];

// Fix cumProb to ensure last is exactly 1.0 (already is, but be safe)
// The probabilities: 20%, 15%, 33%, 13.2%, 14%, 4%, 3%, 0.8% = 103%
// Adjusting to fit exactly 100%:
const SCRATCH_PROBS = [
  { prob: 0.200, type: "nothing",   label: "Rien",         crcValue: 0,  xpValue: 0,   symbol: "💨" },
  { prob: 0.150, type: "xp_50",     label: "+50 XP",       crcValue: 0,  xpValue: 50,  symbol: "⭐" },
  { prob: 0.330, type: "refund",    label: "Remboursé",    crcValue: 1,  xpValue: 0,   symbol: "🪙" },
  { prob: 0.132, type: "xp_100",    label: "+100 XP",      crcValue: 0,  xpValue: 100, symbol: "🌟" },
  { prob: 0.108, type: "crc_2",     label: "+2 CRC",       crcValue: 2,  xpValue: 0,   symbol: "💰" },
  { prob: 0.040, type: "streak_x2", label: "Streak x2",    crcValue: 0,  xpValue: 0,   symbol: "🔥" },
  { prob: 0.032, type: "crc_5",     label: "+5 CRC",       crcValue: 5,  xpValue: 0,   symbol: "💎" },
  { prob: 0.008, type: "crc_20",    label: "+20 CRC",      crcValue: 20, xpValue: 0,   symbol: "👑" },
];

// ─── Daily Spin Probabilities ─────────────────────────
const SPIN_PROBS = [
  { prob: 0.20, type: "nothing",   label: "Rien",       crcValue: 0,  xpValue: 0,   color: "#6B7280" },
  { prob: 0.15, type: "xp_50",     label: "+50 XP",     crcValue: 0,  xpValue: 50,  color: "#8B5CF6" },
  { prob: 0.30, type: "crc_1",     label: "+1 CRC",     crcValue: 1,  xpValue: 0,   color: "#10B981" },
  { prob: 0.13, type: "xp_100",    label: "+100 XP",    crcValue: 0,  xpValue: 100, color: "#6366F1" },
  { prob: 0.13, type: "crc_3",     label: "+3 CRC",     crcValue: 3,  xpValue: 0,   color: "#F59E0B" },
  { prob: 0.05, type: "streak_x2", label: "Streak x2",  crcValue: 0,  xpValue: 0,   color: "#EF4444" },
  { prob: 0.03, type: "crc_10",    label: "+10 CRC",    crcValue: 10, xpValue: 0,   color: "#EC4899" },
  { prob: 0.01, type: "jackpot",   label: "JACKPOT",    crcValue: 0,  xpValue: 0,   color: "#FFD700" },
];

// ─── Deterministic seed → [0, 1) ─────────────────────
function seedToNumber(seed: string): number {
  const hash = keccakHex(seed);
  // Take first 8 hex chars → 32-bit number → normalize to [0, 1)
  const num = parseInt(hash.slice(2, 10), 16);
  return num / 0xFFFFFFFF;
}

// ─── Scratch Result ───────────────────────────────────
export function determineScratchResult(seed: string): ScratchResult {
  const roll = seedToNumber(seed);

  let cumulative = 0;
  let winner = SCRATCH_PROBS[0];
  for (const entry of SCRATCH_PROBS) {
    cumulative += entry.prob;
    if (roll < cumulative) {
      winner = entry;
      break;
    }
  }

  // Generate 3 symbols: 2 matching (the winner) + 1 different
  const allSymbols = SCRATCH_PROBS.map(p => p.symbol);
  const winnerSymbol = winner.symbol;
  const otherSymbols = allSymbols.filter(s => s !== winnerSymbol);

  // Pick a random "other" symbol using a second seed
  const otherRoll = seedToNumber(seed + "-other");
  const otherSymbol = otherSymbols[Math.floor(otherRoll * otherSymbols.length)];

  // Arrange: position of the odd one out (0, 1, or 2)
  const posRoll = seedToNumber(seed + "-pos");
  const oddPos = Math.floor(posRoll * 3);
  const symbols = [winnerSymbol, winnerSymbol, winnerSymbol];
  symbols[oddPos] = otherSymbol;

  return {
    type: winner.type,
    label: winner.label,
    crcValue: winner.crcValue,
    xpValue: winner.xpValue,
    symbols,
  };
}

// ─── Spin Result ──────────────────────────────────────
export function determineSpinResult(seed: string): SpinResult {
  const roll = seedToNumber(seed + "-spin");

  let cumulative = 0;
  let winnerIndex = 0;
  for (let i = 0; i < SPIN_PROBS.length; i++) {
    cumulative += SPIN_PROBS[i].prob;
    if (roll < cumulative) {
      winnerIndex = i;
      break;
    }
  }

  const winner = SPIN_PROBS[winnerIndex];

  return {
    type: winner.type,
    label: winner.label,
    crcValue: winner.crcValue,
    xpValue: winner.xpValue,
    segmentIndex: winnerIndex,
  };
}

// ─── Jackpot Info ─────────────────────────────────────
export async function getJackpotInfo(): Promise<{
  total: number;
  threshold: number;
  contributors: number;
  percentage: number;
}> {
  const result = await db
    .select({
      total: sql<number>`COALESCE(SUM(${jackpotPool.amountCrc}), 0)`,
      contributors: sql<number>`COUNT(DISTINCT ${jackpotPool.address})`,
    })
    .from(jackpotPool);

  const total = Number(result[0]?.total ?? 0);
  const contributors = Number(result[0]?.contributors ?? 0);
  const threshold = parseInt(process.env.JACKPOT_THRESHOLD_CRC || "1000", 10);
  const percentage = Math.min(100, Math.round((total / threshold) * 100));

  return { total, threshold, contributors, percentage };
}

// ─── Safe Balance Check ───────────────────────────────
const MIN_SAFE_BALANCE_CRC = 500;

export async function isSafeBalanceSafe(): Promise<boolean> {
  try {
    const balance = await getSafeCrcBalance();
    const balanceCrc = Number(ethers.formatEther(balance.erc1155));
    return balanceCrc >= MIN_SAFE_BALANCE_CRC;
  } catch {
    return true; // Assume safe if check fails
  }
}

// ─── Today string ─────────────────────────────────────
export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}
