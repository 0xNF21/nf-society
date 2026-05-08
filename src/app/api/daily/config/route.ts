import { NextResponse } from "next/server";
import { getScratchProbs, getSpinProbs } from "@/lib/daily";

export async function GET() {
  try {
    const [scratch, spin] = await Promise.all([
      getScratchProbs(),
      getSpinProbs(),
    ]);

    return NextResponse.json({ scratch, spin });
  } catch (error: any) {
    console.error("[Daily Config] Error:", error.message);
    return NextResponse.json({ error: "Config failed" }, { status: 500 });
  }
}
