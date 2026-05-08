import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { dailyRewardsConfig } from "@/lib/db/schema";
import { getScratchProbs, getSpinProbs, invalidateDailyCache } from "@/lib/daily";
import { checkAdminAuth } from "@/lib/admin-auth";

type AdminDailyReward = {
  prob: number;
  type: string;
  label: string;
  crcValue: number;
  xpValue: number;
  symbol?: string;
  color?: string;
};

function normalizeAdminRewards(key: "scratch" | "spin", rewards: unknown[]): { rewards?: AdminDailyReward[]; error?: string } {
  if (rewards.length === 0) return { error: "At least one reward is required" };

  const seenTypes = new Set<string>();
  const normalized: AdminDailyReward[] = [];

  for (let i = 0; i < rewards.length; i++) {
    const row = rewards[i] as Partial<AdminDailyReward> | null;
    const prob = Number(row?.prob);
    const crcValue = Number(row?.crcValue ?? 0);
    const xpValue = Number(row?.xpValue ?? 0);
    const type = String(row?.type ?? "").trim();
    const label = String(row?.label ?? "").trim();

    if (!type) return { error: `Reward ${i + 1}: type is required` };
    if (seenTypes.has(type)) return { error: `Reward ${i + 1}: duplicate type "${type}"` };
    if (!label) return { error: `Reward ${i + 1}: label is required` };
    if (!Number.isFinite(prob) || prob < 0) return { error: `Reward ${i + 1}: invalid probability` };
    if (!Number.isFinite(crcValue) || crcValue < 0) return { error: `Reward ${i + 1}: invalid CRC value` };
    if (!Number.isFinite(xpValue) || xpValue < 0) return { error: `Reward ${i + 1}: invalid XP value` };

    seenTypes.add(type);
    normalized.push({
      prob: Math.round(prob * 1_000_000_000) / 1_000_000_000,
      type,
      label,
      crcValue: Math.round(crcValue * 1_000) / 1_000,
      xpValue: Math.floor(xpValue),
      ...(key === "scratch"
        ? { symbol: String(row?.symbol ?? "").trim() || "?" }
        : { color: String(row?.color ?? "").trim() || "#6B7280" }),
    });
  }

  return { rewards: normalized };
}

// GET — get scratch and spin reward tables
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-daily", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [scratch, spin] = await Promise.all([getScratchProbs(), getSpinProbs()]);
  return NextResponse.json({ scratch, spin });
}

// PATCH — update a reward table (scratch or spin)
export async function PATCH(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-daily", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { key, rewards } = await req.json();
    if ((key !== "scratch" && key !== "spin") || !Array.isArray(rewards)) {
      return NextResponse.json({ error: "key and rewards[] required" }, { status: 400 });
    }

    const normalized = normalizeAdminRewards(key, rewards);
    if (normalized.error || !normalized.rewards) {
      return NextResponse.json({ error: normalized.error || "Invalid rewards" }, { status: 400 });
    }

    // Validate probabilities sum to ~1.0
    const totalProb = normalized.rewards.reduce((s: number, r: { prob: number }) => s + r.prob, 0);
    if (Math.abs(totalProb - 1.0) > 0.01) {
      return NextResponse.json({ error: `Probabilities sum to ${totalProb.toFixed(3)}, should be 1.0` }, { status: 400 });
    }

    await db.insert(dailyRewardsConfig).values({
      key,
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
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Admin Daily] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
