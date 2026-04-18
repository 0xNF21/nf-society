import { NextResponse } from "next/server";
import { computePlatformStats, PlatformStats } from "@/lib/platform-stats";

// Cache 5 min pour eviter de taper la DB et le RPC a chaque visite.
export const revalidate = 300;
export const dynamic = "force-static";

let cache: { data: PlatformStats; at: number } | null = null;
const CACHE_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json(cache.data);
    }
    const data = await computePlatformStats();
    cache = { data, at: Date.now() };
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/stats/platform] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
