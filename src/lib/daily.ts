import crypto from "crypto";
import { sql } from "drizzle-orm";
import { ethers } from "ethers";
import { db } from "./db";
import { jackpotPool } from "./db/schema";
import { keccakHex } from "./hash";
import { getSafeCrcBalance } from "./payout";
import type { DailyWheelResult } from "./daily-shared";

export type { DailyWheelResult } from "./daily-shared";

export function generateDailyToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return `DAILY-${code}`;
}

type DailyRewardConfigEntry = {
  prob: number;
  type: string;
  label: string;
  crcValue: number;
  xpValue: number;
  color?: string;
};

const DEFAULT_DAILY_WHEEL_PROBS: DailyRewardConfigEntry[] = [
  { prob: 0.20, type: "nothing", label: "Rien", crcValue: 0, xpValue: 0, color: "#6B7280" },
  { prob: 0.35, type: "xp_5", label: "+5 XP", crcValue: 0, xpValue: 5, color: "#10B981" },
  { prob: 0.28, type: "xp_10", label: "+10 XP", crcValue: 0, xpValue: 10, color: "#38BDF8" },
  { prob: 0.12, type: "xp_25", label: "+25 XP", crcValue: 0, xpValue: 25, color: "#8B5CF6" },
  { prob: 0.04, type: "xp_50", label: "+50 XP", crcValue: 0, xpValue: 50, color: "#6366F1" },
  { prob: 0.009, type: "crc_1_rare", label: "+1 CRC", crcValue: 1, xpValue: 0, color: "#F59E0B" },
  { prob: 0.001, type: "crc_10_rare", label: "+10 CRC", crcValue: 10, xpValue: 0, color: "#EC4899" },
];

let cachedDailyWheel: DailyRewardConfigEntry[] | null = null;
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

function keepWheelRewardsOnly(rewards: DailyRewardConfigEntry[]): DailyRewardConfigEntry[] {
  const filtered = rewards.filter((reward) => (
    reward.type === "nothing" || reward.crcValue > 0 || reward.xpValue > 0
  ));
  if (filtered.length === 0) return DEFAULT_DAILY_WHEEL_PROBS;

  const totalProb = filtered.reduce((sum, reward) => sum + reward.prob, 0);
  if (totalProb <= 0) return DEFAULT_DAILY_WHEEL_PROBS;

  return filtered.map((reward) => ({
    ...reward,
    prob: reward.prob / totalProb,
  }));
}

function isLegacyDailyWheelConfig(rewards: DailyRewardConfigEntry[]): boolean {
  return rewards.some((r) => r.type === "crc_10" && r.crcValue === 10 && Math.abs(r.prob - 0.03) < 0.001)
    || rewards.some((r) => r.type === "jackpot" && Math.abs(r.prob - 0.01) < 0.001);
}

export async function getDailyWheelProbs() {
  if (cachedDailyWheel && Date.now() - dailyCacheTime < DAILY_CACHE_TTL) return cachedDailyWheel;

  try {
    const { dailyRewardsConfig } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    let [row] = await db.select().from(dailyRewardsConfig).where(eq(dailyRewardsConfig.key, "wheel"));

    if (!row) {
      [row] = await db.select().from(dailyRewardsConfig).where(eq(dailyRewardsConfig.key, "spin"));
    }

    if (row) {
      const raw = typeof row.rewards === "string" ? JSON.parse(row.rewards) : row.rewards;
      const normalizedRewards = normalizeRewards(raw as DailyRewardConfigEntry[]);
      cachedDailyWheel = isLegacyDailyWheelConfig(normalizedRewards)
        ? DEFAULT_DAILY_WHEEL_PROBS
        : keepWheelRewardsOnly(normalizedRewards);
      dailyCacheTime = Date.now();
      return cachedDailyWheel;
    }
  } catch {}

  return DEFAULT_DAILY_WHEEL_PROBS;
}

export function invalidateDailyCache() {
  cachedDailyWheel = null;
  dailyCacheTime = 0;
}

export function allowDailyRepeatTests(): boolean {
  return process.env.DAILY_ALLOW_REPEAT_TESTS === "true"
    || process.env.VERCEL_ENV === "preview"
    || process.env.NODE_ENV !== "production";
}

function seedToNumber(seed: string): number {
  const hash = keccakHex(seed);
  const num = parseInt(hash.slice(2, 10), 16);
  return num / 0xFFFFFFFF;
}

export async function determineDailyWheelResult(seed: string): Promise<DailyWheelResult> {
  const probs = await getDailyWheelProbs();
  const roll = seedToNumber(seed + "-wheel");

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
