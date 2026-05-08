import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { db } from "@/lib/db";
import { dailyRewardsConfig } from "@/lib/db/schema";
import { getDailyWheelProbs, invalidateDailyCache } from "@/lib/daily";
import { enforceRateLimit } from "@/lib/rate-limit";

type AdminDailyReward = {
  prob: number;
  type: string;
  label: string;
  crcValue: number;
  xpValue: number;
  color?: string;
};

const MAX_REWARD_ROWS = 20;
const MAX_DAILY_XP_REWARD = 10_000;
const MAX_DAILY_EXPECTED_XP = 10_000;
const MAX_DAILY_CRC_REWARD = 100;
const MAX_DAILY_EXPECTED_CRC = 10;
const MAX_REWARD_TEXT_LENGTH = 48;
const REWARD_TYPE_RE = /^[a-z0-9][a-z0-9_:-]{1,63}$/;
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;

function normalizeAdminRewards(rewards: unknown[]): { rewards?: AdminDailyReward[]; error?: string } {
  if (rewards.length === 0) return { error: "At least one reward is required" };
  if (rewards.length > MAX_REWARD_ROWS) return { error: `At most ${MAX_REWARD_ROWS} rewards are allowed` };

  const seenTypes = new Set<string>();
  const normalized: AdminDailyReward[] = [];

  for (let i = 0; i < rewards.length; i++) {
    const row = rewards[i] as Partial<AdminDailyReward> | null;
    const prob = Number(row?.prob);
    const crcValue = Number(row?.crcValue ?? 0);
    const xpValue = Number(row?.xpValue ?? 0);
    const type = String(row?.type ?? "").trim();
    const label = String(row?.label ?? "").trim();
    const color = String(row?.color ?? "").trim();

    if (!type) return { error: `Reward ${i + 1}: type is required` };
    if (!REWARD_TYPE_RE.test(type)) return { error: `Reward ${i + 1}: invalid type format` };
    if (seenTypes.has(type)) return { error: `Reward ${i + 1}: duplicate type "${type}"` };
    if (!label) return { error: `Reward ${i + 1}: label is required` };
    if (label.length > MAX_REWARD_TEXT_LENGTH) return { error: `Reward ${i + 1}: label is too long` };
    if (!Number.isFinite(prob) || prob < 0) return { error: `Reward ${i + 1}: invalid probability` };
    if (!Number.isFinite(crcValue) || crcValue < 0) return { error: `Reward ${i + 1}: invalid CRC value` };
    if (!Number.isFinite(xpValue) || xpValue < 0) return { error: `Reward ${i + 1}: invalid XP value` };
    if (crcValue === 0 && xpValue === 0) {
      return { error: `Reward ${i + 1}: every line must give XP or CRC` };
    }
    if (crcValue > 0 && xpValue > 0) {
      return { error: `Reward ${i + 1}: choose either XP or CRC, not both` };
    }
    if (crcValue > MAX_DAILY_CRC_REWARD) return { error: `Reward ${i + 1}: CRC value must be <= ${MAX_DAILY_CRC_REWARD}` };
    if (xpValue > MAX_DAILY_XP_REWARD) return { error: `Reward ${i + 1}: XP balance value must be <= ${MAX_DAILY_XP_REWARD}` };
    if (color && !HEX_COLOR_RE.test(color)) return { error: `Reward ${i + 1}: color must be #RRGGBB` };

    seenTypes.add(type);
    normalized.push({
      prob: Math.round(prob * 1_000_000_000) / 1_000_000_000,
      type,
      label,
      crcValue: Math.round(crcValue * 1_000) / 1_000,
      xpValue: Math.floor(xpValue),
      color: color || "#6B7280",
    });
  }

  return { rewards: normalized };
}

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-daily", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const wheel = await getDailyWheelProbs();
  return NextResponse.json({ wheel });
}

export async function PATCH(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-daily", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { key = "wheel", rewards } = await req.json();
    if (key !== "wheel" || !Array.isArray(rewards)) {
      return NextResponse.json({ error: "key=wheel and rewards[] required" }, { status: 400 });
    }

    const normalized = normalizeAdminRewards(rewards);
    if (normalized.error || !normalized.rewards) {
      return NextResponse.json({ error: normalized.error || "Invalid rewards" }, { status: 400 });
    }

    const totalProb = normalized.rewards.reduce((sum, reward) => sum + reward.prob, 0);
    if (Math.abs(totalProb - 1.0) > 0.01) {
      return NextResponse.json({ error: `Probabilities sum to ${totalProb.toFixed(3)}, should be 1.0` }, { status: 400 });
    }

    const expectedXp = normalized.rewards.reduce((sum, reward) => sum + reward.prob * reward.xpValue, 0);
    if (expectedXp > MAX_DAILY_EXPECTED_XP) {
      return NextResponse.json({ error: `Expected XP balance per wheel is ${expectedXp.toFixed(2)}, max is ${MAX_DAILY_EXPECTED_XP}` }, { status: 400 });
    }

    const expectedCrc = normalized.rewards.reduce((sum, reward) => sum + reward.prob * reward.crcValue, 0);
    if (expectedCrc > MAX_DAILY_EXPECTED_CRC) {
      return NextResponse.json({ error: `Expected CRC per wheel is ${expectedCrc.toFixed(4)}, max is ${MAX_DAILY_EXPECTED_CRC}` }, { status: 400 });
    }

    await db.insert(dailyRewardsConfig).values({
      key: "wheel",
      rewards: JSON.stringify(normalized.rewards),
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: dailyRewardsConfig.key,
      set: {
        rewards: JSON.stringify(normalized.rewards),
        updatedAt: new Date(),
      },
    });

    invalidateDailyCache();
    return NextResponse.json({ ok: true, wheel: normalized.rewards });
  } catch (error) {
    console.error("[Admin Daily] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
