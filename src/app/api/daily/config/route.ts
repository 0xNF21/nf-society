import { NextResponse } from "next/server";
import { getDailyWheelProbs } from "@/lib/daily";

export async function GET() {
  try {
    const wheel = await getDailyWheelProbs();

    return NextResponse.json({ wheel });
  } catch (error: any) {
    console.error("[Daily Config] Error:", error.message);
    return NextResponse.json({ error: "Config failed" }, { status: 500 });
  }
}
