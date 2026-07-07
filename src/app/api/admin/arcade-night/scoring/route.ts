import { NextRequest, NextResponse } from "next/server";

import {
  ArcadeNightScoringUnavailableError,
  computeArcadeNightScoringSnapshot,
  saveArcadeNightScoringSnapshot,
} from "@/lib/arcade-night-scoring";
import { checkAdminAuth } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-arcade-night-scoring", 20, 60_000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await computeArcadeNightScoringSnapshot();
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    if (error instanceof ArcadeNightScoringUnavailableError) {
      return NextResponse.json({ error: "scoring_unavailable", message: error.message }, { status: 503 });
    }
    console.error("[Admin Arcade Night Scoring] GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-arcade-night-scoring", 8, 60_000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const snapshot = await saveArcadeNightScoringSnapshot({
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, snapshot });
  } catch (error) {
    if (error instanceof ArcadeNightScoringUnavailableError) {
      return NextResponse.json({ error: "scoring_unavailable", message: error.message }, { status: 503 });
    }
    console.error("[Admin Arcade Night Scoring] POST error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
