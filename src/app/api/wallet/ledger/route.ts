export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getLedger } from "@/lib/wallet";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "wallet-ledger", 30, 60000);
  if (limited) return limited;

  try {
    const address = req.nextUrl.searchParams.get("address");
    if (!address) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 20;
    const entries = await getLedger(address, isNaN(limit) ? 20 : limit);
    return NextResponse.json({ entries });
  } catch (error: any) {
    console.error("[Wallet] ledger error:", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
