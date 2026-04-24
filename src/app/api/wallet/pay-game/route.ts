export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { payGameFromBalance } from "@/lib/wallet";
import { respondIfStakesDisabled } from "@/lib/stakes";

/**
 * POST /api/wallet/pay-game
 *
 * Body: {
 *   gameKey: string,      // e.g. "morpion", "roulette", "plinko"
 *   slug: string,         // game slug (multi) or table slug (chance)
 *   address: string,      // payer — MUST match the UI's trusted address
 *                         // (miniapp walletAddress, or demo/saved profile)
 *   playerToken: string,  // client-generated token, stored on the row
 *                         // for anti-cheat on subsequent action calls
 *   amount: number,       // bet amount in CRC
 *
 *   // Optional extras
 *   ballValue?: number,   // plinko — required
 *   mineCount?: number,   // mines — required
 *   pickCount?: number,   // keno — required
 * }
 *
 * Success:
 *   200 { ok: true, balanceAfter, ledgerId, family: "multi"|"chance", ... }
 *
 * Errors:
 *   400 { error: "missing_fields" | "invalid_address" | ... }
 *   422 { error: "insufficient_balance" | "wrong_bet" | "already_joined" |
 *              "already_full" | "invalid_bet" | "invalid_param" }
 *   404 { error: "not_found" | "table_not_found" }
 *
 * The debit + ledger write + game-side write commit as a single PG
 * transaction. If anything fails the balance is untouched.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "wallet-pay-game", 30, 60000);
  if (limited) return limited;

  const disabled = await respondIfStakesDisabled();
  if (disabled) return disabled;

  try {
    const body = await req.json().catch(() => ({}));
    const { gameKey, slug, address, playerToken, amount, ballValue, mineCount, pickCount, choice } = body || {};

    if (!gameKey || !slug || !address || !playerToken || typeof amount !== "number") {
      return NextResponse.json({ error: "missing_fields" }, { status: 400 });
    }

    const result = await payGameFromBalance({
      address: String(address),
      gameKey: String(gameKey),
      slug: String(slug),
      amount: Number(amount),
      playerToken: String(playerToken),
      extras: {
        ballValue: typeof ballValue === "number" ? ballValue : undefined,
        mineCount: typeof mineCount === "number" ? mineCount : undefined,
        pickCount: typeof pickCount === "number" ? pickCount : undefined,
        choice: choice === "heads" || choice === "tails" ? choice : undefined,
      },
    });

    if (!result.ok) {
      const status =
        result.error === "invalid_address" || result.error === "invalid_amount" ||
        result.error === "missing_player_token" || result.error === "unsupported_game"
          ? 400
          : result.error === "not_found" || result.error === "table_not_found"
            ? 404
            : 422;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("[Wallet] pay-game error:", error?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
