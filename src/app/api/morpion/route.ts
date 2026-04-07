import { NextRequest, NextResponse } from "next/server";
import { createMultiplayerGame } from "@/lib/multiplayer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { game } = await createMultiplayerGame("morpion", body);
    return NextResponse.json(game, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create game";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
