import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { ALL_GAMES, ALL_CHANCE_GAMES, CATEGORY_FLAGS } from "@/lib/game-registry";
import { checkAdminAuth } from "@/lib/admin-auth";

const VALID_STATUSES = ["enabled", "coming_soon", "hidden"];

// GET — list all flags, auto-create missing ones from game registry
export async function GET(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const flags = await db.select().from(featureFlags);
  const existingKeys = new Set(flags.map(f => f.key));

  // Auto-create missing flags from all registries
  const toCreate: { key: string; label: string; category: string }[] = [
    ...ALL_GAMES.filter(g => !existingKeys.has(g.featureFlag)).map(g => ({
      key: g.featureFlag,
      label: g.key.charAt(0).toUpperCase() + g.key.slice(1),
      category: "multiplayer",
    })),
    ...ALL_CHANCE_GAMES.filter(g => !existingKeys.has(g.featureFlag)).map(g => ({
      key: g.featureFlag,
      label: g.label,
      category: "chance",
    })),
    ...CATEGORY_FLAGS.filter(f => !existingKeys.has(f.key)).map(f => ({
      key: f.key,
      label: f.label,
      category: "general",
    })),
  ];
  for (const item of toCreate) {
    try {
      const [created] = await db.insert(featureFlags).values({
        key: item.key,
        status: "enabled",
        label: item.label,
        category: item.category,
      }).onConflictDoNothing().returning();
      if (created) flags.push(created);
    } catch {}
  }

  return NextResponse.json({ flags });
}

// PATCH — change a flag's status
export async function PATCH(req: NextRequest) {
  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { key, status } = await req.json();
    if (!key || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "key and status (enabled|coming_soon|hidden) required" },
        { status: 400 }
      );
    }
    const [updated] = await db
      .update(featureFlags)
      .set({ status, updatedAt: new Date() })
      .where(eq(featureFlags.key, key))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }
    return NextResponse.json({ flag: updated });
  } catch (error) {
    console.error("[Admin Flags] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
