import { NextRequest, NextResponse } from "next/server";
import { createCrcRace, getLobbyCrcRaces } from "@/lib/crc-races-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rooms = await getLobbyCrcRaces();
    return NextResponse.json({ rooms });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list races";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { slug, game } = await createCrcRace({
      tier: body.tier,
      maxPlayers: Number(body.maxPlayers),
      isPrivate: !!body.isPrivate,
    });
    return NextResponse.json({ slug, game }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create race";
    console.error("[CrcRaces] Create error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
