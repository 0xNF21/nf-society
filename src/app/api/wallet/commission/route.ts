export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { DAO_TREASURY_ADDRESS, getBalance, getLedger } from "@/lib/wallet";

/**
 * GET /api/wallet/commission
 *
 * Returns the DAO treasury state:
 * - address: the pseudo-address tracking commission
 * - balanceCrc: total commission accumulated (never on-chain — purely DB)
 * - ledger: recent commission credits (optional, capped at 50)
 *
 * Public read. No sensitive info — just aggregated fee stats.
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "wallet-commission", 30, 60000);
  if (limited) return limited;

  try {
    const [balanceCrc, ledger] = await Promise.all([
      getBalance(DAO_TREASURY_ADDRESS),
      getLedger(DAO_TREASURY_ADDRESS, 50),
    ]);
    return NextResponse.json({
      address: DAO_TREASURY_ADDRESS,
      balanceCrc,
      ledger,
    });
  } catch (error: any) {
    console.error("[Wallet] commission error:", error?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
