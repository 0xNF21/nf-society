import { NextResponse } from "next/server";
import { runDailyScan } from "@/lib/daily-scan";

export async function POST() {
  try {
    const processed = await runDailyScan();
    return NextResponse.json({ processed });
  } catch (error: any) {
    console.error("[DailyScan] Fatal error:", error.message);
    return NextResponse.json({ error: error.message || "Scan failed" }, { status: 500 });
  }
}
