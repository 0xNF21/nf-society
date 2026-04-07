import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { xpConfig } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { invalidateXpCache } from "@/lib/xp-server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

function checkAuth(req: NextRequest) {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD;
}

// GET — list all XP config
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const configs = await db.select().from(xpConfig);
  return NextResponse.json({ configs });
}

// PATCH — update a single config value
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { key, value, label } = await req.json();
    if (!key || typeof value !== "number" || value < 0) {
      return NextResponse.json({ error: "key and value (>= 0) required" }, { status: 400 });
    }
    const updates: Record<string, unknown> = { value, updatedAt: new Date() };
    if (label) updates.label = label;

    const [updated] = await db.update(xpConfig).set(updates).where(eq(xpConfig.key, key)).returning();
    if (!updated) return NextResponse.json({ error: "Config not found" }, { status: 404 });

    invalidateXpCache();
    return NextResponse.json({ config: updated });
  } catch (error) {
    console.error("[Admin XP] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST — create a new XP config entry
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { key, value, category, label } = await req.json();
    if (!key || typeof value !== "number" || !category || !label) {
      return NextResponse.json({ error: "key, value, category, label required" }, { status: 400 });
    }
    const [created] = await db.insert(xpConfig).values({
      key,
      value,
      category,
      label,
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
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { key } = await req.json();
    if (!key) return NextResponse.json({ error: "key required" }, { status: 400 });
    await db.delete(xpConfig).where(eq(xpConfig.key, key));
    invalidateXpCache();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Admin XP] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
