import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { playerBadges } from "@/lib/db/schema";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

function checkAuth(req: NextRequest) {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD;
}

// POST — manually award a badge to a player
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { address, badgeSlug } = await req.json();
    if (!address || !badgeSlug) {
      return NextResponse.json({ error: "address and badgeSlug required" }, { status: 400 });
    }
    await db.insert(playerBadges)
      .values({ address: address.toLowerCase(), badgeSlug })
      .onConflictDoNothing();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Admin Badge Award] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
