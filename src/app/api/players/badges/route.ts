import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { checkAndAwardBadges } from "@/lib/badges";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "players-badges", 30, 60000);
  if (limited) return limited;

  // Auth-gated : address vient de la session, jamais du body. Combine avec
  // PR #51 (xpOverride retire) pour fermer les voies de mutation joueur
  // forgees client-side.
  const addressOr401 = await requireAuthenticatedAddress(req);
  if (addressOr401 instanceof NextResponse) return addressOr401;
  const address = addressOr401;

  try {
    const { action, context } = await req.json();
    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }
    const newBadges = await checkAndAwardBadges(address, action, context ?? {});
    return NextResponse.json({ newBadges });
  } catch (e) {
    console.error("[Badge Check API]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
