export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { payGameFromXp } from "@/lib/wallet-xp";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

/**
 * POST /api/blackjack/start-free
 *
 * Equivalent XP du flow CRC pour une main de blackjack.
 * Address verifiee server-side via la session auth (jamais depuis le body).
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "blackjack-start-free", 20, 60000);
  if (limited) return limited;

  const addressOr401 = await requireAuthenticatedAddress(req);
  if (addressOr401 instanceof NextResponse) return addressOr401;
  const address = addressOr401;

  try {
    const body = await req.json().catch(() => ({}));
    const { tableSlug, playerToken, amount } = body || {};
    if (!tableSlug || !playerToken || typeof amount !== "number") {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const result = await payGameFromXp({
      gameKey: "blackjack",
      slug: String(tableSlug),
      address,
      playerToken: String(playerToken),
      amount: Number(amount),
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
  } catch (err: any) {
    console.error("[blackjack/start-free] error:", err?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
