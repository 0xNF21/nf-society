import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { awardPlayerXp } from "@/lib/xp-server";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "players-xp", 30, 60000);
  if (limited) return limited;

  try {
    const { address, action } = await req.json();
    if (!address || !action) {
      return NextResponse.json({ error: "Missing address or action" }, { status: 400 });
    }

    const result = await awardPlayerXp({ address, action });
    if ("error" in result) {
      const message = result.error === "unknown_action" ? "Unknown action" : "Missing address or action";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[XP API]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
