import { NextRequest, NextResponse } from "next/server";

import {
  ArcadeNightTablesUnavailableError,
  ArcadeNightValidationError,
  getArcadeNightPublicState,
  updateArcadeNightConfig,
} from "@/lib/arcade-night";
import { checkAdminAuth } from "@/lib/admin-auth";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-arcade-night", 20, 60_000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await getArcadeNightPublicState();
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    console.error("[Admin Arcade Night] GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-arcade-night", 10, 60_000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const state = await updateArcadeNightConfig(body, {
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent"),
    });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    if (error instanceof ArcadeNightValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof ArcadeNightTablesUnavailableError) {
      return NextResponse.json({
        error: "season_tables_unavailable",
        message: "Les tables Season ne sont pas encore migrees. Applique la migration S0-1 avant de sauver.",
      }, { status: 503 });
    }

    console.error("[Admin Arcade Night] POST error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
