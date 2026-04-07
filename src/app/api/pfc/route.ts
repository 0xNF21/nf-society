import { NextRequest, NextResponse } from "next/server";
import { createMultiplayerGame } from "@/lib/multiplayer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { game } = await createMultiplayerGame("pfc", body);
    return NextResponse.json(game, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create game";
    console.error("[PFC] Create error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
