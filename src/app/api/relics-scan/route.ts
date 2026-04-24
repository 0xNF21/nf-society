export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { respondIfStakesDisabled } from "@/lib/stakes";
import { scanGamePayments } from "@/lib/multiplayer";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "relics-scan", 10, 60000);
  if (limited) return limited;

  const disabled = await respondIfStakesDisabled();
  if (disabled) return disabled;

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
