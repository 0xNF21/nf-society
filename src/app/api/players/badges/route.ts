import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkAndAwardBadges } from "@/lib/badges";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "players-badges", 30, 60000);
  if (limited) return limited;

  try {
    const { address, action, context } = await req.json();
    if (!address || !action) {
      return NextResponse.json({ error: "Missing address or action" }, { status: 400 });
    }
    const newBadges = await checkAndAwardBadges(address, action, context ?? {});
    return NextResponse.json({ newBadges });
  } catch (e) {
    console.error("[Badge Check API]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
