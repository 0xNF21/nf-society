import { NextRequest, NextResponse } from "next/server";
import { scanGamePayments } from "@/lib/multiplayer";

export async function POST(req: NextRequest) {
  try {
    const gameSlug = req.nextUrl.searchParams.get("gameSlug");
    if (!gameSlug) return NextResponse.json({ error: "gameSlug is required" }, { status: 400 });

    const result = await scanGamePayments("pfc", gameSlug);
    return NextResponse.json({ game: result.game });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Scan failed";
    console.error("[PFC Scan] Error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
