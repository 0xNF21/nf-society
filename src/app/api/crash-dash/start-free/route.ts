export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { payGameFromXp } from "@/lib/wallet-xp";

/**
 * POST /api/crash-dash/start-free
 * Equivalent XP du flow CRC — creation d'une partie chance.
 * Reutilise le dispatcher existant (assignMultiPlayer / createChanceRound) via payGameFromXp.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "crash-dash-start-free", 20, 60000);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const { tableSlug, address, playerToken, amount, ballValue, mineCount, pickCount, choice } = body || {};
    if (!tableSlug || !address || !playerToken || typeof amount !== "number") {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const gameKey = "crash_dash";
    const extras = {
      ballValue: typeof ballValue === "number" ? ballValue : undefined,
      mineCount: typeof mineCount === "number" ? mineCount : undefined,
      pickCount: typeof pickCount === "number" ? pickCount : undefined,
      choice: choice === "heads" || choice === "tails" ? choice : undefined,
    };

    const result = await payGameFromXp({
      gameKey,
      slug: String(tableSlug),
      address: String(address),
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
    console.error("[crash-dash/start-free] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
