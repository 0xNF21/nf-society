export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { payGameFromFragments } from "@/lib/wallet-fragments";
import { isRealStakesEnabled } from "@/lib/stakes";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

/**
 * POST /api/relics/start-free
 * Equivalent Fragments du flow CRC - assignation a un slot multijoueur.
 * Reutilise le dispatcher existant (assignMultiPlayer / createChanceRound) via payGameFromFragments.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "relics-start-free", 20, 60000);
  if (limited) return limited;

  // Gate F2P — voir morpion/start-free pour le contexte audit PR1.
  if (await isRealStakesEnabled("relics")) {
    return NextResponse.json(
      { error: "USE_PAID_PATH", message: "Real-stakes mode is active for this game. Use the paid flow." },
      { status: 403 },
    );
  }

  // Auth-gated : address vient de la session, pas du body.
  const addressOr401 = await requireAuthenticatedAddress(req);
  if (addressOr401 instanceof NextResponse) return addressOr401;
  const address = addressOr401;

  try {
    const body = await req.json().catch(() => ({}));
    const { slug, playerToken, amount, ballValue, mineCount, pickCount, choice } = body || {};
    if (!slug || !playerToken || typeof amount !== "number") {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const gameKey = "relics";
    const extras = {
      ballValue: typeof ballValue === "number" ? ballValue : undefined,
      mineCount: typeof mineCount === "number" ? mineCount : undefined,
      pickCount: typeof pickCount === "number" ? pickCount : undefined,
      choice: choice === "heads" || choice === "tails" ? choice : undefined,
    };

    const result = await payGameFromFragments({
      gameKey,
      slug: String(slug),
      address,
      playerToken: String(playerToken),
      amount: Number(amount),
      extras,
    });

    if (!result.ok) {
      const status =
        result.error === "invalid_address" ||
        result.error === "invalid_amount" ||
        result.error === "missing_player_token" ||
        result.error === "unsupported_game"
          ? 400
          : result.error === "not_found" || result.error === "table_not_found"
            ? 404
            : 422;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("[relics/start-free] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
