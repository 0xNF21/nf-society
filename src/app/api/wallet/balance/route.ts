export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getBalance } from "@/lib/wallet";
import { getAuthenticatedAddress } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "wallet-balance", 30, 60000);
  if (limited) return limited;

  try {
    const address = req.nextUrl.searchParams.get("address");
    if (!address) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    const addr = address.toLowerCase();
    const authenticatedAddress = await getAuthenticatedAddress(req).catch(() => null);
    if (authenticatedAddress?.toLowerCase() !== addr) {
      return NextResponse.json(
        { error: "AUTH_REQUIRED", message: "Wallet balance is only available to the authenticated owner." },
        { status: 401 },
      );
    }

    const balanceCrc = await getBalance(addr);
    return NextResponse.json({ balanceCrc });
  } catch (error: any) {
    console.error("[Wallet] balance error:", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
