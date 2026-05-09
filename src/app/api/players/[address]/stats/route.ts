import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getPlayerStats } from "@/lib/multiplayer";
import { getAuthenticatedAddress } from "@/lib/auth/session";
import { applyPlayerStatsPrivacy, getPrivacyFlags } from "@/lib/privacy";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const limited = await enforceRateLimit(_req, "players-address-stats", 30, 60000);
  if (limited) return limited;

  try {
    const address = params.address.toLowerCase();
    const authenticatedAddress = await getAuthenticatedAddress(_req).catch(() => null);
    const isOwner = authenticatedAddress?.toLowerCase() === address;
    const [stats, privacy] = await Promise.all([
      getPlayerStats(address),
      isOwner ? null : getPrivacyFlags(address),
    ]);
    return NextResponse.json(privacy ? applyPlayerStatsPrivacy(stats, privacy) : stats);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
