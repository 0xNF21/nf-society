export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

/**
 * Minimal public config for the wallet topup flow.
 * Exposes only the Safe recipient address (already public on-chain).
 */
export async function GET() {
  const safeAddress = process.env.SAFE_ADDRESS || "";
  return NextResponse.json({ safeAddress });
}
