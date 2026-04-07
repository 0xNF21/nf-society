import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { badges, playerBadges } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

function checkAuth(req: NextRequest) {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD;
}

// GET — list all badges
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allBadges = await db.select().from(badges);
  return NextResponse.json({ badges: allBadges });
}

// POST — create a new badge
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { slug, name, description, icon, category, secret, condition } = await req.json();
    if (!slug || !name || !description || !icon || !category) {
      return NextResponse.json({ error: "slug, name, description, icon, category required" }, { status: 400 });
    }
    const [created] = await db.insert(badges).values({
      slug,
      name,
      description,
      icon,
      iconType: "emoji",
      category,
      secret: !!secret,
      condition: condition || { type: "manual" },
    }).returning();
    return NextResponse.json({ badge: created }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error";
    if (msg.includes("duplicate key")) return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — update a badge
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { slug, ...updates } = body;
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const allowed: Record<string, unknown> = {};
    if (typeof updates.name === "string") allowed.name = updates.name;
    if (typeof updates.description === "string") allowed.description = updates.description;
    if (typeof updates.icon === "string") allowed.icon = updates.icon;
    if (typeof updates.category === "string") allowed.category = updates.category;
    if (typeof updates.secret === "boolean") allowed.secret = updates.secret;
    if (updates.condition) allowed.condition = updates.condition;

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    const [updated] = await db.update(badges).set(allowed).where(eq(badges.slug, slug)).returning();
    if (!updated) return NextResponse.json({ error: "Badge not found" }, { status: 404 });
    return NextResponse.json({ badge: updated });
  } catch (error) {
    console.error("[Admin Badges] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// DELETE — delete a badge and its awards
export async function DELETE(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { slug } = await req.json();
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    // Delete awards first
    await db.delete(playerBadges).where(eq(playerBadges.badgeSlug, slug));
    // Delete badge
    await db.delete(badges).where(eq(badges.slug, slug));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Admin Badges] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
