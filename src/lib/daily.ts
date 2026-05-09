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
  fragmentsValue: number;
  color?: string;
};

type RawDailyRewardConfigEntry = {
  prob?: unknown;
  type?: unknown;
  label?: unknown;
  crcValue?: unknown;
  fragmentsValue?: unknown;
  xpValue?: unknown;
  color?: unknown;
};

const DEFAULT_DAILY_WHEEL_PROBS: DailyRewardConfigEntry[] = [
  { prob: 0.45, type: "fragments_75", label: "+75 Fragments", crcValue: 0, fragmentsValue: 75, color: "#10B981" },
  { prob: 0.35, type: "fragments_200", label: "+200 Fragments", crcValue: 0, fragmentsValue: 200, color: "#38BDF8" },
  { prob: 0.17, type: "fragments_500", label: "+500 Fragments", crcValue: 0, fragmentsValue: 500, color: "#8B5CF6" },
  { prob: 0.028, type: "crc_1_rare", label: "+1 CRC", crcValue: 1, fragmentsValue: 0, color: "#F59E0B" },
  { prob: 0.002, type: "crc_10_rare", label: "+10 CRC", crcValue: 10, fragmentsValue: 0, color: "#EC4899" },
];

let cachedDailyWheel: DailyRewardConfigEntry[] | null = null;
let dailyCacheTime = 0;
const DAILY_CACHE_TTL = 60_000;

function nonNegativeNumber(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, numeric);
}

function nonNegativeInteger(value: unknown): number {
  return Math.floor(nonNegativeNumber(value));
}

function fragmentsValueFromReward(reward: RawDailyRewardConfigEntry): number {
  return nonNegativeInteger(reward.fragmentsValue ?? reward.xpValue);
}

function normalizeRewardType(type: unknown, fragmentsValue: number, crcValue: number): string {
  const normalized = String(type ?? "").trim().replace(/^xp_/, "fragments_");
  if (normalized) return normalized;
  if (fragmentsValue > 0) return `fragments_${fragmentsValue}`;
  if (crcValue > 0) return `crc_${String(crcValue).replace(".", "_")}`;
  return "nothing";
}

function fallbackRewardLabel(type: string, fragmentsValue: number, crcValue: number): string {
  if (fragmentsValue > 0) return `+${fragmentsValue} Fragments`;
  if (crcValue > 0) return `+${crcValue} CRC`;
  return type || "Rien";
}

function normalizeRewardLabel(label: unknown, type: string, fragmentsValue: number, crcValue: number): string {
  const raw = typeof label === "string" ? label.trim() : "";
  return (raw || fallbackRewardLabel(type, fragmentsValue, crcValue))
    .replace(/XP( de solde)?/gi, "Fragments");
}

function normalizeRewards(rewards: unknown): DailyRewardConfigEntry[] {
  if (!Array.isArray(rewards)) return DEFAULT_DAILY_WHEEL_PROBS;

  return rewards.map((rawReward) => {
    const reward = rawReward && typeof rawReward === "object"
      ? rawReward as RawDailyRewardConfigEntry
      : {};
    const crcValue = nonNegativeNumber(reward.crcValue);
    const fragmentsValue = fragmentsValueFromReward(reward);
    const type = normalizeRewardType(reward.type, fragmentsValue, crcValue);
    const label = normalizeRewardLabel(reward.label, type, fragmentsValue, crcValue);
    const color = typeof reward.color === "string" && reward.color.trim()
      ? reward.color.trim()
      : undefined;

    return {
      prob: nonNegativeNumber(reward.prob),
      type,
      label,
      crcValue,
      fragmentsValue,
      color,
    };
  });
}

function keepWheelRewardsOnly(rewards: DailyRewardConfigEntry[]): DailyRewardConfigEntry[] {
  const filtered = rewards.filter((reward) => (
    reward.crcValue > 0 || reward.fragmentsValue > 0
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
  return rewards.some((r) => r.type === "nothing" || (r.crcValue === 0 && r.fragmentsValue === 0))
    || rewards.some((r) => r.type === "crc_10" && r.crcValue === 10 && Math.abs(r.prob - 0.03) < 0.001)
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
      const normalizedRewards = normalizeRewards(raw);
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

export function normalizeDailyWheelResult(raw: unknown): DailyWheelResult | null {
  if (!raw || typeof raw !== "object") return null;

  const result = raw as RawDailyRewardConfigEntry & { segmentIndex?: unknown };
  const crcValue = nonNegativeNumber(result.crcValue);
  const fragmentsValue = fragmentsValueFromReward(result);
  const type = normalizeRewardType(result.type, fragmentsValue, crcValue);
  const label = normalizeRewardLabel(result.label, type, fragmentsValue, crcValue);
  const segmentIndexValue = Number(result.segmentIndex);
  const segmentIndex = Number.isInteger(segmentIndexValue) && segmentIndexValue >= 0
    ? segmentIndexValue
    : 0;
  const color = typeof result.color === "string" && result.color.trim()
    ? result.color.trim()
    : undefined;

  return {
    type,
    label,
    crcValue,
    fragmentsValue,
    segmentIndex,
    color,
  };
}

export function parseDailyWheelResult(value: string | null | undefined): DailyWheelResult | null {
  if (!value) return null;

  try {
    return normalizeDailyWheelResult(JSON.parse(value));
  } catch {
    return null;
  }
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
    fragmentsValue: winner.fragmentsValue,
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
