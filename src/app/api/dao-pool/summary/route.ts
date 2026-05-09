export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import {
  getDaoFragmentsPoolByGame,
  getDaoFragmentsPoolLast30d,
  getDaoFragmentsPoolTotal,
} from "@/lib/dao-fragments-pool";

/**
 * GET /api/dao-pool/summary
 *
 * Snapshot du pot communautaire Fragments accumule depuis le pivot Free-to-Play.
 * Endpoint public — on ne revele aucune donnee personnelle, juste les
 * agregats utilises par `/dashboard-dao` et eventuellement les annonces.
 */
export async function GET() {
  try {
    const [totalFragments, last30dFragments, byGame] = await Promise.all([
      getDaoFragmentsPoolTotal(),
      getDaoFragmentsPoolLast30d(),
      getDaoFragmentsPoolByGame(20),
    ]);
    return NextResponse.json({
      totalFragments,
      last30dFragments,
      byGame,
    });
  } catch (err) {
    console.error("[dao-pool/summary] error:", err);
    return NextResponse.json({ totalFragments: 0, last30dFragments: 0, byGame: [] });
  }
}
