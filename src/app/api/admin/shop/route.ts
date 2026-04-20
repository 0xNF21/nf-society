import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shopItems } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdminAuth } from "@/lib/admin-auth";

// GET — list all shop items
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const items = await db.select().from(shopItems);
  return NextResponse.json({ items });
}

// PATCH — update a shop item
export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { slug, ...updates } = body;
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    // Only allow updating specific fields
    const allowed: Record<string, unknown> = {};
    if (typeof updates.xpCost === "number") allowed.xpCost = updates.xpCost;
    if (typeof updates.levelRequired === "number") allowed.levelRequired = updates.levelRequired;
    if (typeof updates.stock === "number" || updates.stock === null) allowed.stock = updates.stock;
    if (typeof updates.active === "boolean") allowed.active = updates.active;
    if (typeof updates.name === "string") allowed.name = updates.name;
    if (typeof updates.description === "string") allowed.description = updates.description;
    if (typeof updates.icon === "string") allowed.icon = updates.icon;
    if (typeof updates.category === "string") allowed.category = updates.category;

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const [updated] = await db.update(shopItems).set(allowed).where(eq(shopItems.slug, slug)).returning();
    if (!updated) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error("[Admin Shop] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// POST — create a new shop item
export async function POST(req: NextRequest) {
  if (!checkAdminAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { slug, name, description, icon, category, xpCost, levelRequired, stock, active } = await req.json();
    if (!slug || !name || !description || !icon || !category || typeof xpCost !== "number") {
      return NextResponse.json({ error: "slug, name, description, icon, category, xpCost required" }, { status: 400 });
    }
    const [created] = await db.insert(shopItems).values({
      slug,
      name,
      description,
      icon,
      category,
      xpCost,
      levelRequired: levelRequired ?? 1,
      stock: stock ?? null,
      active: active ?? true,
    }).returning();
    return NextResponse.json({ item: created }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal error";
    if (message.includes("duplicate key")) {
      return NextResponse.json({ error: "Slug already exists" }, { status: 409 });
    }
    console.error("[Admin Shop] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
