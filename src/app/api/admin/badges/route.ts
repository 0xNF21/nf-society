import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { badges, playerBadges, type BadgeCondition } from "@/lib/db/schema";
import { checkAdminAuth } from "@/lib/admin-auth";

const BADGE_SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const ACTION_RE = /^(\*_[a-z0-9_]+|[a-z0-9_]+\*?|[a-z0-9_]+)$/;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 240;
const MAX_ICON_LENGTH = 16;
const MAX_ACTION_LENGTH = 64;
const MAX_BADGE_XP_THRESHOLD = 50_000_000;
const MAX_BADGE_LEVEL_THRESHOLD = 100;

const BADGE_CATEGORIES = new Set(["game", "activity", "event", "secret"]);
const CONDITION_TYPES = new Set<BadgeCondition["type"]>([
  "first",
  "streak",
  "count",
  "hour_before",
  "hour_between",
  "lose_streak",
  "manual",
  "xp_threshold",
  "level_threshold",
  "games_played",
  "games_won",
  "crc_won",
  "multi_game",
]);
const ACTION_REQUIRED_TYPES = new Set<BadgeCondition["type"]>([
  "first",
  "streak",
  "count",
  "hour_before",
  "lose_streak",
]);
const VALUE_RULES: Partial<Record<BadgeCondition["type"], { min: number; max: number }>> = {
  streak: { min: 1, max: 365 },
  count: { min: 1, max: 100_000 },
  hour_before: { min: 0, max: 23 },
  lose_streak: { min: 1, max: 100 },
  xp_threshold: { min: 1, max: MAX_BADGE_XP_THRESHOLD },
  level_threshold: { min: 1, max: MAX_BADGE_LEVEL_THRESHOLD },
  games_played: { min: 1, max: 100_000 },
  games_won: { min: 1, max: 100_000 },
  crc_won: { min: 1, max: 1_000_000 },
  multi_game: { min: 1, max: 50 },
};
const PROTECTED_BADGES = new Set(["supreme_founder"]);

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function normalizeString(value: unknown, field: string, maxLength: number): { value?: string; error?: string } {
  if (typeof value !== "string") return { error: `${field} must be a string` };

  const trimmed = value.trim();
  if (!trimmed) return { error: `${field} is required` };
  if (trimmed.length > maxLength) return { error: `${field} is too long` };

  return { value: trimmed };
}

function normalizeSlug(value: unknown): { value?: string; error?: string } {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!normalized) return { error: "slug required" };
  if (!BADGE_SLUG_RE.test(normalized)) {
    return { error: "slug must use lowercase letters, numbers, hyphens or underscores" };
  }

  return { value: normalized };
}

function normalizeCategory(value: unknown): { value?: string; error?: string } {
  const category = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!BADGE_CATEGORIES.has(category)) {
    return { error: "category must be game, activity, event or secret" };
  }

  return { value: category };
}

function normalizeInteger(
  value: unknown,
  field: string,
  min: number,
  max: number,
): { value?: number; error?: string } {
  const numeric = typeof value === "number" ? value : NaN;
  if (!Number.isInteger(numeric)) return { error: `${field} must be an integer` };
  if (numeric < min || numeric > max) return { error: `${field} must be between ${min} and ${max}` };

  return { value: numeric };
}

function normalizeAction(value: unknown, required: boolean): { value?: string; error?: string } {
  const action = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!action) return required ? { error: "condition.action is required for this condition type" } : {};
  if (action.length > MAX_ACTION_LENGTH) return { error: "condition.action is too long" };
  if (!ACTION_RE.test(action)) {
    return { error: "condition.action must use lowercase letters, numbers, underscores and optional wildcard" };
  }

  return { value: action };
}

function normalizeCondition(value: unknown): { value?: BadgeCondition; error?: string } {
  if (value == null) return { value: { type: "manual" } };
  if (typeof value !== "object" || Array.isArray(value)) return { error: "condition must be an object" };

  const raw = value as Record<string, unknown>;
  const type = typeof raw.type === "string" ? raw.type.trim().toLowerCase() : "";
  if (!CONDITION_TYPES.has(type as BadgeCondition["type"])) {
    return { error: "condition.type is invalid" };
  }

  const condition: BadgeCondition = { type: type as BadgeCondition["type"] };
  const action = normalizeAction(raw.action, ACTION_REQUIRED_TYPES.has(condition.type));
  if (action.error) return { error: action.error };
  if (action.value) condition.action = action.value;

  if (condition.type === "hour_between") {
    const min = normalizeInteger(raw.min, "condition.min", 0, 23);
    if (min.error || min.value === undefined) return { error: min.error ?? "condition.min is required" };

    const max = normalizeInteger(raw.max, "condition.max", 1, 24);
    if (max.error || max.value === undefined) return { error: max.error ?? "condition.max is required" };
    if (min.value >= max.value) return { error: "condition.min must be lower than condition.max" };

    condition.min = min.value;
    condition.max = max.value;
    return { value: condition };
  }

  const valueRule = VALUE_RULES[condition.type];
  if (valueRule) {
    const normalizedValue = normalizeInteger(raw.value, "condition.value", valueRule.min, valueRule.max);
    if (normalizedValue.error || normalizedValue.value === undefined) {
      return { error: normalizedValue.error ?? "condition.value is required" };
    }
    condition.value = normalizedValue.value;
  }

  return { value: condition };
}

// GET - list all badges
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-badges", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return error("Unauthorized", 401);
  const allBadges = await db.select().from(badges);
  return NextResponse.json({ badges: allBadges });
}

// POST - create a new badge
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-badges", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return error("Unauthorized", 401);
  try {
    const body = (await req.json()) as Record<string, unknown>;

    const slug = normalizeSlug(body.slug);
    if (slug.error || !slug.value) return error(slug.error ?? "slug required");

    const name = normalizeString(body.name, "name", MAX_NAME_LENGTH);
    if (name.error || !name.value) return error(name.error ?? "name required");

    const description = normalizeString(body.description, "description", MAX_DESCRIPTION_LENGTH);
    if (description.error || !description.value) return error(description.error ?? "description required");

    const icon = normalizeString(body.icon, "icon", MAX_ICON_LENGTH);
    if (icon.error || !icon.value) return error(icon.error ?? "icon required");

    const category = normalizeCategory(body.category);
    if (category.error || !category.value) return error(category.error ?? "category is invalid");

    const condition = normalizeCondition(body.condition);
    if (condition.error || !condition.value) return error(condition.error ?? "condition is invalid");

    const [created] = await db.insert(badges).values({
      slug: slug.value,
      name: name.value,
      description: description.value,
      icon: icon.value,
      iconType: "emoji",
      category: category.value,
      secret: typeof body.secret === "boolean" ? body.secret : category.value === "secret",
      condition: condition.value,
    }).returning();

    return NextResponse.json({ badge: created }, { status: 201 });
  } catch (caught: unknown) {
    const message = caught instanceof Error ? caught.message : "Error";
    if (message.includes("duplicate key")) return error("Slug already exists", 409);
    console.error("[Admin Badges] Error:", caught);
    return error("Internal error", 500);
  }
}

// PATCH - update a badge
export async function PATCH(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-badges", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return error("Unauthorized", 401);
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const { slug: rawSlug, ...updates } = body;

    const slug = normalizeSlug(rawSlug);
    if (slug.error || !slug.value) return error(slug.error ?? "slug required");

    const allowed: Record<string, unknown> = {};

    if ("name" in updates) {
      const name = normalizeString(updates.name, "name", MAX_NAME_LENGTH);
      if (name.error || !name.value) return error(name.error ?? "name is invalid");
      allowed.name = name.value;
    }

    if ("description" in updates) {
      const description = normalizeString(updates.description, "description", MAX_DESCRIPTION_LENGTH);
      if (description.error || !description.value) return error(description.error ?? "description is invalid");
      allowed.description = description.value;
    }

    if ("icon" in updates) {
      const icon = normalizeString(updates.icon, "icon", MAX_ICON_LENGTH);
      if (icon.error || !icon.value) return error(icon.error ?? "icon is invalid");
      allowed.icon = icon.value;
    }

    if ("category" in updates) {
      const category = normalizeCategory(updates.category);
      if (category.error || !category.value) return error(category.error ?? "category is invalid");
      allowed.category = category.value;
    }

    if ("secret" in updates) {
      if (typeof updates.secret !== "boolean") return error("secret must be a boolean");
      allowed.secret = updates.secret;
    }

    if ("condition" in updates) {
      const condition = normalizeCondition(updates.condition);
      if (condition.error || !condition.value) return error(condition.error ?? "condition is invalid");
      allowed.condition = condition.value;
    }

    if (Object.keys(allowed).length === 0) {
      return error("No valid fields");
    }

    const [updated] = await db.update(badges).set(allowed).where(eq(badges.slug, slug.value)).returning();
    if (!updated) return error("Badge not found", 404);

    return NextResponse.json({ badge: updated });
  } catch (caught) {
    console.error("[Admin Badges] Error:", caught);
    return error("Internal error", 500);
  }
}

// DELETE - delete a badge and its awards
export async function DELETE(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-badges", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return error("Unauthorized", 401);
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const slug = normalizeSlug(body.slug);
    if (slug.error || !slug.value) return error(slug.error ?? "slug required");
    if (PROTECTED_BADGES.has(slug.value)) {
      return error("This badge is protected and cannot be deleted");
    }

    const [existing] = await db.select({ slug: badges.slug }).from(badges).where(eq(badges.slug, slug.value)).limit(1);
    if (!existing) return error("Badge not found", 404);

    await db.delete(playerBadges).where(eq(playerBadges.badgeSlug, slug.value));
    await db.delete(badges).where(eq(badges.slug, slug.value));

    return NextResponse.json({ ok: true });
  } catch (caught) {
    console.error("[Admin Badges] Error:", caught);
    return error("Internal error", 500);
  }
}
