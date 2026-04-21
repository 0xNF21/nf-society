import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { computeLevel, getLevelName, xpToNextLevel } from "@/lib/xp";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const limited = await enforceRateLimit(_req, "players-address", 30, 60000);
  if (limited) return limited;

  try {
    const address = params.address.toLowerCase();
    const [player] = await db.select().from(players).where(eq(players.address, address));

    if (!player) {
      return NextResponse.json({
        address,
        xp: 0,
        level: 1,
        levelName: "Level 1",
        xpToNext: 100,
        streak: 0,
      });
    }

    const level = computeLevel(player.xp);
    return NextResponse.json({
      address: player.address,
      xp: player.xp,
      level,
      levelName: getLevelName(level),
      xpToNext: xpToNextLevel(player.xp),
      streak: player.streak,
    });
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
