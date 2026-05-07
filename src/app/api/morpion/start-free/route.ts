export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { payGameFromXp } from "@/lib/wallet-xp";
import { isRealStakesEnabled } from "@/lib/stakes";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

/**
 * POST /api/morpion/start-free
 *
 * Equivalent XP de /api/wallet/pay-game pour une partie morpion.
 * Utilise en mode Free-to-Play (flag `real_stakes=hidden`).
 *
 * Body: {
 *   slug: string,          // slug de la partie morpion existante (creee via POST /api/morpion)
 *   address: string,       // adresse du joueur (peut etre un handle demo 0x...)
 *   playerToken: string,   // token anti-triche cote client
 *   amount: number,        // mise XP
 * }
 *
 * Success: 200 { ok: true, xpAfter, role: "player1"|"player2", gameRow }
 * Errors :
 *   400 missing_fields / invalid_address / invalid_amount / missing_player_token / unsupported_game
 *   404 not_found
 *   422 insufficient_xp / wrong_bet / already_joined / already_full
 *   500 internal_error
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "morpion-start-free", 20, 60000);
  if (limited) return limited;

  // Gate F2P — si le mode CRC reel est actif pour ce jeu, le client doit
  // utiliser /api/wallet/pay-game (balance) ou le scan on-chain (paiement
  // direct), pas la route XP gratuite. Bloque la fuite "start-free + payout
  // CRC" identifiee dans l'audit PR1.
  if (await isRealStakesEnabled("morpion")) {
    return NextResponse.json(
      { error: "USE_PAID_PATH", message: "Real-stakes mode is active for this game. Use the paid flow." },
      { status: 403 },
    );
  }

  // Auth-gated : address vient EXCLUSIVEMENT de la session (jamais du body).
  // Empeche un attaquant de faire perdre l'XP de la victime en spoofant son
  // address dans le body.
  const addressOr401 = await requireAuthenticatedAddress(req);
  if (addressOr401 instanceof NextResponse) return addressOr401;
  const address = addressOr401;

  try {
    const body = await req.json().catch(() => ({}));
    const { slug, playerToken, amount } = body || {};
    if (!slug || !playerToken || typeof amount !== "number") {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const result = await payGameFromXp({
      gameKey: "morpion",
      slug: String(slug),
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
    console.error("[morpion/start-free] error:", err?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
