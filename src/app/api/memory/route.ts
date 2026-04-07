import { NextRequest, NextResponse } from "next/server";
import { createMultiplayerGame } from "@/lib/multiplayer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const game = await createMultiplayerGame("memory", body);
    return NextResponse.json(game, { status: 201 });
  } catch (error: any) {
    const status = error.message === "No recipient address configured" ? 500 : 400;
    return NextResponse.json({ error: error.message || "Failed to create game" }, { status });
  }
}
