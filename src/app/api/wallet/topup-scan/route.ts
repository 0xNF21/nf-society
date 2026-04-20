export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { scanWalletTopups, getBalance } from "@/lib/wallet";

/**
 * POST /api/wallet/topup-scan { address? }
 *
 * Scans the Safe for pending wallet:topup payments. Idempotent via the
 * wallet_ledger.tx_hash UNIQUE constraint. Returns the summary plus the
 * caller's current balance so the UI can poll a single endpoint.
 *
 * `address` in the body is optional — if supplied, we also return the
 * caller's post-scan balance. If omitted, we just return the scan result.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "wallet-topup-scan", 10, 60000);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const address = body?.address ? String(body.address) : undefined;

    const summary = await scanWalletTopups();
    const balanceCrc = address ? await getBalance(address) : undefined;

    return NextResponse.json({ ...summary, balanceCrc });
  } catch (error: any) {
    console.error("[Wallet] topup-scan error:", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
