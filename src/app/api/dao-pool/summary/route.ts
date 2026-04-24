export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDaoPoolTotal, getDaoPoolLast30d, getDaoPoolByGame } from "@/lib/dao-pool";

/**
 * GET /api/dao-pool/summary
 *
 * Snapshot du pot communautaire XP accumule depuis le pivot Free-to-Play.
 * Endpoint public — on ne revele aucune donnee personnelle, juste les
 * agregats utilises par `/dashboard-dao` et eventuellement les annonces.
 */
export async function GET() {
  try {
    const [totalXp, last30dXp, byGame] = await Promise.all([
      getDaoPoolTotal(),
      getDaoPoolLast30d(),
      getDaoPoolByGame(20),
    ]);
    return NextResponse.json({ totalXp, last30dXp, byGame });
  } catch (err) {
    console.error("[dao-pool/summary] error:", err);
    return NextResponse.json({ totalXp: 0, last30dXp: 0, byGame: [] });
  }
}
