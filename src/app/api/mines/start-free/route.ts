export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { payGameFromFragments } from "@/lib/wallet-fragments";
import { isRealStakesEnabled } from "@/lib/stakes";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

/**
 * POST /api/mines/start-free
 * Equivalent Fragments du flow CRC - creation d'une partie chance.
 * Reutilise le dispatcher existant (assignMultiPlayer / createChanceRound) via payGameFromFragments.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "mines-start-free", 20, 60000);
  if (limited) return limited;

  const gameKey = "mines";
  if (await isRealStakesEnabled(gameKey)) {
    return NextResponse.json(
      { error: "USE_PAID_PATH", message: "Real-stakes mode is active for this game. Use the paid flow." },
      { status: 403 },
    );
  }

  const addressOr401 = await requireAuthenticatedAddress(req);
  if (addressOr401 instanceof NextResponse) return addressOr401;
  const address = addressOr401;


  try {
    const body = await req.json().catch(() => ({}));
    const { tableSlug, playerToken, amount, ballValue, mineCount, pickCount, choice } = body || {};
    if (!tableSlug || !playerToken || typeof amount !== "number") {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }
    const extras = {
      ballValue: typeof ballValue === "number" ? ballValue : undefined,
      mineCount: typeof mineCount === "number" ? mineCount : undefined,
      pickCount: typeof pickCount === "number" ? pickCount : undefined,
      choice: choice === "heads" || choice === "tails" ? choice : undefined,
    };

    const result = await payGameFromFragments({
      gameKey,
      slug: String(tableSlug),
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
    console.error("[mines/start-free] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
