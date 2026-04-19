export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { scanCrcRacePayments } from "@/lib/crc-races-server";

export async function POST(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("gameSlug");
    if (!slug) return NextResponse.json({ error: "gameSlug is required" }, { status: 400 });

    const result = await scanCrcRacePayments(slug);
    return NextResponse.json({ game: result.game, newPayments: result.newPayments });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed";
    console.error("[CrcRacesScan] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
