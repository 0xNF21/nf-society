import { NextResponse } from "next/server";
import { getLobbyGames } from "@/lib/multiplayer";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rooms = await getLobbyGames();
    return NextResponse.json({ rooms });
  } catch (error) {
    console.error("[Lobby] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
