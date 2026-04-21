export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Minimal public config for the wallet topup flow.
 * Exposes only the Safe recipient address (already public on-chain).
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "wallet-config", 30, 60000);
  if (limited) return limited;

  const safeAddress = process.env.SAFE_ADDRESS || "";
  return NextResponse.json({ safeAddress });
}
