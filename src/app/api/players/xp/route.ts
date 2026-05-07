import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { awardPlayerXp } from "@/lib/xp-server";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "players-xp", 30, 60000);
  if (limited) return limited;

  // Auth-gated : l'address vient EXCLUSIVEMENT de la session, jamais du body.
  // Combine avec le fix PR #51 (xpOverride retire) pour fermer toute voie de
  // self-attribution arbitraire d'XP.
  const addressOr401 = await requireAuthenticatedAddress(req);
  if (addressOr401 instanceof NextResponse) return addressOr401;
  const address = addressOr401;

  try {
    const { action } = await req.json();
    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const result = await awardPlayerXp({ address, action });
    if ("error" in result) {
      const message = result.error === "unknown_action" ? "Unknown action" : "Missing address or action";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[XP API]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
