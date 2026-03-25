import { NextResponse } from "next/server";
import { getJackpotInfo } from "@/lib/daily";

export async function GET() {
  try {
    const info = await getJackpotInfo();
    return NextResponse.json(info);
  } catch (error: any) {
    console.error("[DailyJackpot] Error:", error.message);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
