import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getPlayerBadges } from "@/lib/badges";

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  const limited = await enforceRateLimit(req, "players-address-badges", 30, 60000);
  if (limited) return limited;

  try {
    const badges = await getPlayerBadges(params.address);
    return NextResponse.json({ badges });
  } catch (e) {
    console.error("[Badges API]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
