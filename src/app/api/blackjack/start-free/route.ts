export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { payGameFromXp } from "@/lib/wallet-xp";

/**
 * POST /api/blackjack/start-free
 *
 * Equivalent XP du flow CRC pour une main de blackjack.
 * Le dispatcher createChanceRound gere la creation du row dans
 * `blackjack_hands` (meme comportement qu'en mode balance CRC — y compris
 * natural blackjack instant-resolve).
 *
 * Body: {
 *   tableSlug: string,     // slug de la table blackjack (ex: "classic")
 *   address: string,
 *   playerToken: string,
 *   amount: number,        // mise XP (doit matcher un betOptions de la table)
 * }
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "blackjack-start-free", 20, 60000);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const { tableSlug, address, playerToken, amount } = body || {};
    if (!tableSlug || !address || !playerToken || typeof amount !== "number") {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const result = await payGameFromXp({
      gameKey: "blackjack",
      slug: String(tableSlug),
      address: String(address),
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
