import { NextRequest, NextResponse } from "next/server";
import { getPlayerBadges } from "@/lib/badges";

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } }
) {
  try {
    const badges = await getPlayerBadges(params.address);
    return NextResponse.json({ badges });
  } catch (e) {
    console.error("[Badges API]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
