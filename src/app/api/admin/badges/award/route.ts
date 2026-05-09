import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { badges, playerBadges } from "@/lib/db/schema";
import { checkAdminAuth } from "@/lib/admin-auth";

const ADDRESS_RE = /^0x[a-f0-9]{40}$/;
const BADGE_SLUG_RE = /^[a-z0-9][a-z0-9_-]{1,63}$/;

function error(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

// POST - manually award a badge to a player
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-badges-award", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) return error("Unauthorized", 401);
  try {
    const { address, badgeSlug } = (await req.json()) as Record<string, unknown>;
    const normalizedAddress = typeof address === "string" ? address.trim().toLowerCase() : "";
    const normalizedSlug = typeof badgeSlug === "string" ? badgeSlug.trim().toLowerCase() : "";

    if (!ADDRESS_RE.test(normalizedAddress)) return error("address must be a valid EVM address");
    if (!BADGE_SLUG_RE.test(normalizedSlug)) return error("badgeSlug is invalid");

    const [badge] = await db.select({ slug: badges.slug }).from(badges).where(eq(badges.slug, normalizedSlug)).limit(1);
    if (!badge) return error("Badge not found", 404);

    await db.insert(playerBadges)
      .values({ address: normalizedAddress, badgeSlug: normalizedSlug })
      .onConflictDoNothing();

    return NextResponse.json({ ok: true });
  } catch (caught) {
    console.error("[Admin Badge Award] Error:", caught);
    return error("Internal error", 500);
  }
}
