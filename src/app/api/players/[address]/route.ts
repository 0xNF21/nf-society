import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { computeLevel, getLevelName, getLevelProgress, xpToNextLevel } from "@/lib/xp";
import { loadXpConfig } from "@/lib/xp-server";
import { getAuthenticatedAddress } from "@/lib/auth/session";

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const limited = await enforceRateLimit(_req, "players-address", 30, 60000);
  if (limited) return limited;

  try {
    const address = params.address.toLowerCase();
    const authenticatedAddress = await getAuthenticatedAddress(_req).catch(() => null);
    const isOwner = authenticatedAddress?.toLowerCase() === address;
    const { levels } = await loadXpConfig();
    const [player] = await db.select().from(players).where(eq(players.address, address));

    if (!player) {
      const level = computeLevel(0, levels);
      const progress = getLevelProgress(0, levels);
      return NextResponse.json({
        address,
        xp: 0,
        streak: 0,
        level,
        levelName: getLevelName(level, levels),
        xpToNext: xpToNextLevel(0, levels),
        progressPct: progress.progressPct,
        isMaxLevel: progress.isMaxLevel,
        nextLevel: progress.nextLevel,
        ...(isOwner ? { fragmentsBalance: 0 } : {}),
      });
    }

    const level = computeLevel(player.xp, levels);
    const progress = getLevelProgress(player.xp, levels);
    return NextResponse.json({
      address: player.address,
      xp: player.xp,
      streak: player.streak,
      level,
      levelName: getLevelName(level, levels),
      xpToNext: xpToNextLevel(player.xp, levels),
      progressPct: progress.progressPct,
      isMaxLevel: progress.isMaxLevel,
      nextLevel: progress.nextLevel,
      ...(isOwner ? { fragmentsBalance: player.fragmentsBalance } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
