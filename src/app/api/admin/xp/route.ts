import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { xpConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { invalidateXpCache, loadXpConfig, refreshPlayerLevels } from "@/lib/xp-server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { DEFAULT_XP_REWARDS } from "@/lib/xp";

const MAX_REWARD_XP = 10_000;
const MAX_LEVEL_XP = 50_000_000;
const MAX_LABEL_LENGTH = 80;
const XP_KEY_RE = /^[a-z0-9][a-z0-9_:-]{1,63}$/;
const CUSTOM_CATEGORIES = new Set(["reward", "bonus"]);
const DISABLED_DAILY_XP_KEYS = new Set(["daily_checkin", "daily_spin", "daily_wheel", "streak_7days"]);

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isDisabledDailyXpKey(key: string): boolean {
  return DISABLED_DAILY_XP_KEYS.has(key) || key.startsWith("daily_");
}

function validateLabel(label: unknown, required = false): string | null {
  if (label === undefined || label === null) return required ? "label required" : null;
  if (typeof label !== "string") return "label must be a string";
  const trimmed = label.trim();
  if (!trimmed) return required ? "label required" : null;
  if (trimmed.length > MAX_LABEL_LENGTH) return `label must be ${MAX_LABEL_LENGTH} chars or less`;
  return null;
}

function validateValue(category: string, key: string, value: unknown): string | null {
  const numericValue = typeof value === "number" ? value : NaN;
  if (!Number.isInteger(numericValue) || numericValue < 0) return "value must be an integer >= 0";

  if (category === "level") {
    if (!/^level_\d+$/.test(key)) return "level keys must use level_N";
    if (numericValue > MAX_LEVEL_XP) return `level XP must be <= ${MAX_LEVEL_XP}`;
    if (key === "level_1" && numericValue !== 0) return "level_1 must stay at 0 XP";
    return null;
  }

  if (numericValue > MAX_REWARD_XP) return `reward XP must be <= ${MAX_REWARD_XP}`;
  return null;
}

async function validateLevelCurve(key: string, value: number): Promise<string | null> {
  const rows = await db.select().from(xpConfig).where(eq(xpConfig.category, "level"));
  const levels = rows
    .map((row) => ({
      level: parseInt(row.key.replace("level_", ""), 10),
      xpRequired: row.key === key ? value : row.value,
    }))
    .filter((row) => Number.isInteger(row.level))
    .sort((a, b) => a.level - b.level);

  if (levels.length === 0) return null;
  const levelOne = levels.find((row) => row.level === 1);
  if (levelOne && levelOne.xpRequired !== 0) return "level_1 must stay at 0 XP";

  for (let i = 1; i < levels.length; i++) {
    if (levels[i].xpRequired <= levels[i - 1].xpRequired) {
      return `level_${levels[i].level} must require more XP than level_${levels[i - 1].level}`;
    }
  }

  return null;
}

// GET — list all XP config
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-xp", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const configs = await db.select().from(xpConfig);
  return NextResponse.json({ configs });
}

// PATCH — update a single config value
export async function PATCH(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-xp", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { key, value, label } = await req.json();
    const normalizedKey = normalizeKey(key);
    if (!XP_KEY_RE.test(normalizedKey)) {
      return NextResponse.json({ error: "invalid key format" }, { status: 400 });
    }
    if (isDisabledDailyXpKey(normalizedKey)) {
      return NextResponse.json({ error: "Daily rewards use Fragments only and cannot award XP" }, { status: 400 });
    }

    const [existing] = await db.select().from(xpConfig).where(eq(xpConfig.key, normalizedKey)).limit(1);
    if (!existing) return NextResponse.json({ error: "Config not found" }, { status: 404 });

    const valueError = validateValue(existing.category, normalizedKey, value);
    if (valueError) return NextResponse.json({ error: valueError }, { status: 400 });
    if (existing.category === "level") {
      const levelError = await validateLevelCurve(normalizedKey, value);
      if (levelError) return NextResponse.json({ error: levelError }, { status: 400 });
    }

    const labelError = validateLabel(label);
    if (labelError) return NextResponse.json({ error: labelError }, { status: 400 });

    const updates: Record<string, unknown> = { value, updatedAt: new Date() };
    if (typeof label === "string" && label.trim()) updates.label = label.trim();

    const [updated] = await db.update(xpConfig).set(updates).where(eq(xpConfig.key, normalizedKey)).returning();

    invalidateXpCache();
    let refreshedPlayerLevels: number | undefined;
    if (existing.category === "level") {
      const { levels } = await loadXpConfig();
      refreshedPlayerLevels = await refreshPlayerLevels(levels);
    }

    return NextResponse.json({
      config: updated,
      ...(refreshedPlayerLevels !== undefined ? { refreshedPlayerLevels } : {}),
    });
  } catch (error) {
    console.error("[Admin XP] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST — create a new XP config entry
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-xp", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { key, value, category, label } = await req.json();
    const normalizedKey = normalizeKey(key);
    const normalizedCategory = String(category ?? "").trim().toLowerCase();

    if (!XP_KEY_RE.test(normalizedKey)) {
      return NextResponse.json({ error: "invalid key format" }, { status: 400 });
    }
    if (isDisabledDailyXpKey(normalizedKey)) {
      return NextResponse.json({ error: "Daily rewards use Fragments only and cannot award XP" }, { status: 400 });
    }
    if (!CUSTOM_CATEGORIES.has(normalizedCategory)) {
      return NextResponse.json({ error: "category must be reward or bonus" }, { status: 400 });
    }
    const valueError = validateValue(normalizedCategory, normalizedKey, value);
    if (valueError) return NextResponse.json({ error: valueError }, { status: 400 });
    const labelError = validateLabel(label, true);
    if (labelError) return NextResponse.json({ error: labelError }, { status: 400 });
    if (normalizedKey in DEFAULT_XP_REWARDS) {
      return NextResponse.json({ error: "built-in reward already exists" }, { status: 409 });
    }

    const [created] = await db.insert(xpConfig).values({
      key: normalizedKey,
      value,
      category: normalizedCategory,
      label: label.trim(),
    }).returning();

    invalidateXpCache();
    return NextResponse.json({ config: created }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    if (message.includes("duplicate key")) {
      return NextResponse.json({ error: "Key already exists" }, { status: 409 });
    }
    console.error("[Admin XP] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE — remove a config entry
export async function DELETE(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-xp", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { key } = await req.json();
    const normalizedKey = normalizeKey(key);
    if (!XP_KEY_RE.test(normalizedKey)) return NextResponse.json({ error: "invalid key format" }, { status: 400 });

    const [existing] = await db.select().from(xpConfig).where(eq(xpConfig.key, normalizedKey)).limit(1);
    if (!existing) return NextResponse.json({ error: "Config not found" }, { status: 404 });
    if (existing.category === "level") {
      return NextResponse.json({ error: "level configs cannot be deleted" }, { status: 400 });
    }
    if (normalizedKey in DEFAULT_XP_REWARDS) {
      return NextResponse.json({ error: "built-in rewards cannot be deleted; set value to 0 to disable" }, { status: 400 });
    }

    await db.delete(xpConfig).where(eq(xpConfig.key, normalizedKey));
    invalidateXpCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Admin XP] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
