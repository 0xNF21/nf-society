import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getPlayerStats } from "@/lib/multiplayer";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const limited = await enforceRateLimit(_req, "players-address-stats", 30, 60000);
  if (limited) return limited;

  try {
    const stats = await getPlayerStats(params.address);
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
