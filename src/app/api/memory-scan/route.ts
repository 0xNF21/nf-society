export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { respondIfStakesDisabled } from "@/lib/stakes";
import { scanGamePayments } from "@/lib/multiplayer";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "memory-scan", 10, 60000);
  if (limited) return limited;

  const disabled = await respondIfStakesDisabled("memory");
  if (disabled) return disabled;

  try {
    const gameSlug = req.nextUrl.searchParams.get("gameSlug");
    if (!gameSlug) return NextResponse.json({ error: "gameSlug is required" }, { status: 400 });

    const result = await scanGamePayments("memory", gameSlug);
    return NextResponse.json({ game: result.game });
  } catch (error: any) {
    const status = error.message === "Game not found" ? 404 : 500;
    console.error("[MemoryScan] Error:", error.message);
    return NextResponse.json({ error: error.message || "Scan failed" }, { status });
  }
}
