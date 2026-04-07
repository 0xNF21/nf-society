import { NextRequest, NextResponse } from "next/server";
import { getPlayerStats } from "@/lib/multiplayer";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    const stats = await getPlayerStats(params.address);
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
