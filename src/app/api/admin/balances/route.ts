export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";
import { DAO_TREASURY_ADDRESS } from "@/lib/wallet";
import { checkAdminAuth } from "@/lib/admin-auth";

/**
 * GET /api/admin/balances
 *
 * Liste de tous les joueurs ayant un solde CRC > 0 (hors treasury).
 * Trie par solde decroissant. Lecture seule.
 *
 * Auth: `x-admin-password` header.
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-balances", 20, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const res = await db.execute(
      sql`SELECT address,
                 balance_crc::float AS "balanceCrc",
                 last_seen          AS "lastSeen",
                 created_at         AS "createdAt"
          FROM players
          WHERE balance_crc > 0
            AND lower(address) <> ${DAO_TREASURY_ADDRESS}
          ORDER BY balance_crc DESC`,
    );
    const rows = ((res as any).rows ?? (res as any)) as Array<{
      address: string;
      balanceCrc: number;
      lastSeen: string | Date;
      createdAt: string | Date;
    }>;

    const totalCrc = rows.reduce((sum, r) => sum + Number(r.balanceCrc || 0), 0);

    return NextResponse.json({
      players: rows,
      count: rows.length,
      totalCrc: Math.round(totalCrc * 1_000_000) / 1_000_000,
    });
  } catch (error: any) {
    console.error("[AdminBalances] Error:", error?.message);
    return NextResponse.json(
      { error: "internal_error", message: error?.message },
      { status: 500 },
    );
  }
}
