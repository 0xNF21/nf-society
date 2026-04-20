import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { runDailyScan } from "@/lib/daily-scan";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "daily-scan", 10, 60000);
  if (limited) return limited;

  try {
    const processed = await runDailyScan();
    return NextResponse.json({ processed });
  } catch (error: any) {
    console.error("[DailyScan] Fatal error:", error.message);
    return NextResponse.json({ error: error.message || "Scan failed" }, { status: 500 });
  }
}
