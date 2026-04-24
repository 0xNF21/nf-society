export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAdminAuth } from "@/lib/admin-auth";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";
import { executePayout } from "@/lib/payout";

/**
 * POST /api/admin/refund-overpayments
 *
 * Scans historical multiplayer claims to find orphan payments: entries in
 * claimed_payments that were never assigned to player1/player2 of their game
 * (typically a third joiner after both slots filled, or a double-pay). Before
 * the scan fix, these were silently stuck in the Safe.
 *
 * Defaults to dry-run. Pass `?execute=true` to trigger refunds.
 *
 * Auth: `x-admin-password` header must match ADMIN_PASSWORD env.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-refund-overpayments", 5, 60_000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const execute = url.searchParams.get("execute") === "true";

  type Orphan = {
    gameKey: string;
    gameId: number;
    gameSlug: string | null;
    txHash: string;
    playerAddress: string;
    amountCrc: number;
    claimedAt: string;
    refundStatus?: string;
    refundTxHash?: string;
    refundError?: string;
  };
  const orphans: Orphan[] = [];

  try {
    for (const config of ALL_SERVER_GAMES) {
      const claims = await db
        .select()
        .from(claimedPayments)
        .where(eq(claimedPayments.gameType, config.key));
      if (claims.length === 0) continue;

      const gameIds = [...new Set(claims.map((c) => c.gameId))];
      const games = await db
        .select({
          id: config.table.id,
          slug: config.table.slug,
          player1TxHash: config.table.player1TxHash,
          player2TxHash: config.table.player2TxHash,
        })
        .from(config.table)
        .where(inArray(config.table.id, gameIds));

      const gameMap = new Map(games.map((g) => [g.id, g]));

      for (const claim of claims) {
        const game = gameMap.get(claim.gameId);
        if (!game) continue;

        const p1 = game.player1TxHash?.toLowerCase() ?? null;
        const p2 = game.player2TxHash?.toLowerCase() ?? null;
        const tx = claim.txHash.toLowerCase();
        if (tx === p1 || tx === p2) continue; // legitimate player slot

        const entry: Orphan = {
          gameKey: config.key,
          gameId: claim.gameId,
          gameSlug: game.slug,
          txHash: claim.txHash,
          playerAddress: claim.playerAddress,
          amountCrc: claim.amountCrc,
          claimedAt: claim.claimedAt.toISOString(),
        };

        if (execute) {
          try {
            const res = await executePayout({
              gameType: `${config.key}-refund`,
              gameId: `${config.key}-refund-${tx}`,
              recipientAddress: claim.playerAddress,
              amountCrc: claim.amountCrc,
              reason: `Remboursement historique overpayment ${config.key} ${game.slug}`,
            });
            entry.refundStatus = res.status;
            entry.refundTxHash = res.transferTxHash;
            if (res.error) entry.refundError = res.error;

            // Mark as handled so subsequent runs skip it. Safe even on retry:
            // payouts.gameId uniqueness keeps executePayout idempotent.
            if (
              res.success ||
              res.status === "already_paid" ||
              res.status === "already_sending" ||
              res.status === "sending"
            ) {
              await db
                .update(claimedPayments)
                .set({ gameType: `${config.key}-refund` })
                .where(eq(claimedPayments.id, claim.id));
            }
          } catch (err: any) {
            entry.refundStatus = "error";
            entry.refundError = err?.message ?? String(err);
          }
        }

        orphans.push(entry);
      }
    }

    orphans.sort((a, b) => b.claimedAt.localeCompare(a.claimedAt));
    const totalCrc = orphans.reduce((s, o) => s + o.amountCrc, 0);

    return NextResponse.json({
      dryRun: !execute,
      count: orphans.length,
      totalCrc,
      orphans,
    });
  } catch (error: any) {
    console.error("[RefundOverpayments] Error:", error?.message);
    return NextResponse.json(
      { error: "internal_error", message: error?.message },
      { status: 500 },
    );
  }
}
