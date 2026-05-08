import crypto from "crypto";
import { keccakHex } from "./hash";
import { db } from "./db";
import { jackpotPool } from "./db/schema";
import { sql } from "drizzle-orm";
import { getSafeCrcBalance } from "./payout";
import { ethers } from "ethers";

export function generateDailyToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `DAILY-${code}`;
}

import type { ScratchResult, SpinResult } from "./daily-shared";
export type { ScratchResult, SpinResult } from "./daily-shared";

type DailyRewardConfigEntry = {
  prob: number;
  type: string;
  label: string;
  crcValue: number;
  xpValue: number;
  symbol?: string;
  color?: string;
};

const DEFAULT_SCRATCH_PROBS: DailyRewardConfigEntry[] = [
  { prob: 0.25, type: "nothing",    label: "Rien",    crcValue: 0, xpValue: 0,  symbol: "💨" },
  { prob: 0.35, type: "xp_5",       label: "+5 XP",   crcValue: 0, xpValue: 5,  symbol: "✨" },
  { prob: 0.25, type: "xp_10",      label: "+10 XP",  crcValue: 0, xpValue: 10, symbol: "⭐" },
  { prob: 0.10, type: "xp_25",      label: "+25 XP",  crcValue: 0, xpValue: 25, symbol: "🌟" },
  { prob: 0.04, type: "xp_50",      label: "+50 XP",  crcValue: 0, xpValue: 50, symbol: "🔥" },
  { prob: 0.009, type: "crc_1_rare", label: "+1 CRC", crcValue: 1, xpValue: 0,  symbol: "💎" },
  { prob: 0.001, type: "crc_5_rare", label: "+5 CRC", crcValue: 5, xpValue: 0,  symbol: "👑" },
];

const DEFAULT_SPIN_PROBS: DailyRewardConfigEntry[] = [
  { prob: 0.20, type: "nothing",      label: "Rien",    crcValue: 0,  xpValue: 0,  color: "#6B7280" },
  { prob: 0.35, type: "xp_5",         label: "+5 XP",   crcValue: 0,  xpValue: 5,  color: "#10B981" },
  { prob: 0.28, type: "xp_10",        label: "+10 XP",  crcValue: 0,  xpValue: 10, color: "#38BDF8" },
  { prob: 0.12, type: "xp_25",        label: "+25 XP",  crcValue: 0,  xpValue: 25, color: "#8B5CF6" },
  { prob: 0.04, type: "xp_50",        label: "+50 XP",  crcValue: 0,  xpValue: 50, color: "#6366F1" },
  { prob: 0.009, type: "crc_1_rare",  label: "+1 CRC",  crcValue: 1,  xpValue: 0,  color: "#F59E0B" },
  { prob: 0.001, type: "crc_10_rare", label: "+10 CRC", crcValue: 10, xpValue: 0,  color: "#EC4899" },
];

let cachedScratch: DailyRewardConfigEntry[] | null = null;
let cachedSpin: DailyRewardConfigEntry[] | null = null;
let dailyCacheTime = 0;
const DAILY_CACHE_TTL = 60_000;

function normalizeRewards(rewards: DailyRewardConfigEntry[]): DailyRewardConfigEntry[] {
  return rewards.map((reward) => ({
    ...reward,
    prob: Number(reward.prob) || 0,
    crcValue: Math.max(0, Number(reward.crcValue) || 0),
    xpValue: Math.max(0, Math.floor(Number(reward.xpValue) || 0)),
  }));
}

function isLegacyDailyConfig(rewards: DailyRewardConfigEntry[], table: "scratch" | "spin"): boolean {
  if (table === "scratch") {
    return rewards.some((r) => r.type === "refund" && r.crcValue === 1 && Math.abs(r.prob - 0.33) < 0.001)
      || rewards.some((r) => r.type === "crc_20" && r.crcValue === 20 && Math.abs(r.prob - 0.008) < 0.001);
  }
  return rewards.some((r) => r.type === "crc_10" && r.crcValue === 10 && Math.abs(r.prob - 0.03) < 0.001)
    || rewards.some((r) => r.type === "jackpot" && Math.abs(r.prob - 0.01) < 0.001);
}

export async function getScratchProbs() {
  if (cachedScratch && Date.now() - dailyCacheTime < DAILY_CACHE_TTL) return cachedScratch;
  try {
    const { dailyRewardsConfig } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(dailyRewardsConfig).where(eq(dailyRewardsConfig.key, "scratch"));
    if (row) {
      const raw = typeof row.rewards === "string" ? JSON.parse(row.rewards) : row.rewards;
      const rewards = normalizeRewards(raw as DailyRewardConfigEntry[]);
      cachedScratch = isLegacyDailyConfig(rewards, "scratch") ? DEFAULT_SCRATCH_PROBS : rewards;
      dailyCacheTime = Date.now();
      return cachedScratch;
    }
  } catch {}
  return DEFAULT_SCRATCH_PROBS;
}

export async function getSpinProbs() {
  if (cachedSpin && Date.now() - dailyCacheTime < DAILY_CACHE_TTL) return cachedSpin;
  try {
    const { dailyRewardsConfig } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const [row] = await db.select().from(dailyRewardsConfig).where(eq(dailyRewardsConfig.key, "spin"));
    if (row) {
      const raw = typeof row.rewards === "string" ? JSON.parse(row.rewards) : row.rewards;
      const rewards = normalizeRewards(raw as DailyRewardConfigEntry[]);
      cachedSpin = isLegacyDailyConfig(rewards, "spin") ? DEFAULT_SPIN_PROBS : rewards;
      dailyCacheTime = Date.now();
      return cachedSpin;
    }
  } catch {}
  return DEFAULT_SPIN_PROBS;
}

export function invalidateDailyCache() {
  cachedScratch = null;
  cachedSpin = null;
  dailyCacheTime = 0;
}

function seedToNumber(seed: string): number {
  const hash = keccakHex(seed);
  const num = parseInt(hash.slice(2, 10), 16);
  return num / 0xFFFFFFFF;
}

export async function determineScratchResult(seed: string): Promise<ScratchResult> {
  const probs = await getScratchProbs();
  const roll = seedToNumber(seed);

  let cumulative = 0;
  let winner = probs[0];
  for (const entry of probs) {
    cumulative += entry.prob;
    if (roll < cumulative) {
      winner = entry;
      break;
    }
  }

  const allSymbols = probs.map((p) => p.symbol).filter(Boolean) as string[];
  const winnerSymbol = winner.symbol || "⭐";
  const otherSymbols = allSymbols.filter((s) => s !== winnerSymbol);
  const otherRoll = seedToNumber(seed + "-other");
  const otherSymbol = otherSymbols[Math.floor(otherRoll * otherSymbols.length)] || "💨";
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

export async function determineSpinResult(seed: string): Promise<SpinResult> {
  const probs = await getSpinProbs();
  const roll = seedToNumber(seed + "-spin");

  let cumulative = 0;
  let winnerIndex = 0;
  for (let i = 0; i < probs.length; i++) {
    cumulative += probs[i].prob;
    if (roll < cumulative) {
      winnerIndex = i;
      break;
    }
  }

  const winner = probs[winnerIndex];

  return {
    type: winner.type,
    label: winner.label,
    crcValue: winner.crcValue,
    xpValue: winner.xpValue,
    segmentIndex: winnerIndex,
    color: winner.color,
  };
}

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

const MIN_SAFE_BALANCE_CRC = 500;

export async function isSafeBalanceSafe(): Promise<boolean> {
  try {
    const balance = await getSafeCrcBalance();
    const balanceCrc = Number(ethers.formatEther(balance.erc1155));
    return balanceCrc >= MIN_SAFE_BALANCE_CRC;
  } catch {
    return true;
  }
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}
