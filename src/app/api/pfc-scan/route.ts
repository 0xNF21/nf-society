export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { respondIfStakesDisabled } from "@/lib/stakes";
import { scanGamePayments } from "@/lib/multiplayer";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "pfc-scan", 10, 60000);
  if (limited) return limited;

  const disabled = await respondIfStakesDisabled();
  if (disabled) return disabled;

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
