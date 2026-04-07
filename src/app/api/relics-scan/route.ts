import { NextRequest, NextResponse } from "next/server";
import { scanGamePayments } from "@/lib/multiplayer";

export async function POST(req: NextRequest) {
  try {
    const gameSlug =
      req.nextUrl.searchParams.get("gameSlug") ||
      req.nextUrl.searchParams.get("gameId");
    if (!gameSlug)
      return NextResponse.json(
        { error: "gameSlug or gameId is required" },
        { status: 400 }
      );

    const result = await scanGamePayments("relics", gameSlug);
    return NextResponse.json({ game: result.game });
  } catch (error: any) {
    console.error("[RelicsScan] Error:", error.message);
    return NextResponse.json(
      { error: error.message || "Scan failed" },
      { status: 500 }
    );
  }
}
