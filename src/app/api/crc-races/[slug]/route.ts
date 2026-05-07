export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getCrcRace, submitCrcRaceAction, tickCrcRace } from "@/lib/crc-races-server";
import type { RaceAction } from "@/lib/crc-races";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const game = await getCrcRace(params.slug);
    if (!game) return NextResponse.json({ error: "Race not found" }, { status: 404 });
    return NextResponse.json({ game });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fetch failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { slug: string } },
) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string | undefined;

    if (action === "tick") {
      // Tick reste public : c'est un advance d'etat sans action joueur
      // (helper appele par le client polling pour faire avancer la course).
      const game = await tickCrcRace(params.slug);
      if (!game) return NextResponse.json({ error: "Race not found" }, { status: 404 });
      return NextResponse.json({ game });
    }

    if (action === "submit") {
      // Submit = action joueur (boost, attack, etc.) — auth-gated.
      // La session valide le wallet, le playerToken identifie le slot
      // dans la course. Le helper cross-checke que les deux matchent.
      const addressOr401 = await requireAuthenticatedAddress(req);
      if (addressOr401 instanceof NextResponse) return addressOr401;
      const sessionAddress = addressOr401;

      const submitAction = body.submitAction as RaceAction | undefined;
      if (!submitAction) return NextResponse.json({ error: "submitAction required" }, { status: 400 });
      const target = (body.targetAddress as string | null) || null;
      const result = await submitCrcRaceAction(
        params.slug,
        body.playerToken || "",
        submitAction,
        target,
        sessionAddress,
      );
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ game: result.game });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Action failed";
    console.error("[CrcRaces] Action error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
