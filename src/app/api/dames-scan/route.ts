export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { scanGamePayments } from "@/lib/multiplayer";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "dames-scan", 10, 60000);
  if (limited) return limited;

  try {
    const slug = req.nextUrl.searchParams.get("gameSlug") || req.nextUrl.searchParams.get("gameId");
    if (!slug) return NextResponse.json({ error: "gameSlug or gameId is required" }, { status: 400 });

    const result = await scanGamePayments("dames", slug);
    return NextResponse.json({ game: result.game });
  } catch (error: any) {
    console.error("[DamesScan] Error:", error.message);
    return NextResponse.json({ error: error.message || "Scan failed" }, { status: 500 });
  }
}
