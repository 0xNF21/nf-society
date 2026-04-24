export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ethers } from "ethers";
import { db } from "@/lib/db";
import { players, walletLedger } from "@/lib/db/schema";
import { sql, eq, and, inArray } from "drizzle-orm";
import { getSafeCrcBalance } from "@/lib/payout";
import { DAO_TREASURY_ADDRESS } from "@/lib/wallet";
import { checkAdminAuth } from "@/lib/admin-auth";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";

/**
 * GET /api/admin/wallet-health
 *
 * Invariant:  sum(players.balance_crc EXCEPT treasury) + treasury.balance_crc
 *             ==  Safe_onchain_balance   (modulo on-chain-only activity)
 *
 * Returns the three components + their diff so admins can spot drift in real
 * time. A non-zero diff is NOT always a bug — topups mid-scan, pending
 * payouts, or on-chain-only game activity can make the numbers diverge for
 * short windows. But a persistent, growing diff signals something is wrong:
 * a double-pay, a missed scan, or a ledger/code mismatch.
 *
 * Auth: `x-admin-password` header must match ADMIN_PASSWORD env.
 */
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-wallet-health", 10, 60000);
  if (limited) return limited;

  if (!checkAdminAuth(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    // 1) Sum of user balances (everyone except the treasury pseudo-address).
    const userSumRes = await db.execute(
      sql`SELECT COALESCE(SUM(balance_crc), 0)::float AS total,
                 COUNT(*)::int AS n,
                 COUNT(*) FILTER (WHERE balance_crc < 0)::int AS n_negative
          FROM players
          WHERE lower(address) <> ${DAO_TREASURY_ADDRESS}`,
    );
    const userRow =
      (userSumRes as any).rows?.[0] ?? (userSumRes as any)[0] ?? { total: 0, n: 0, n_negative: 0 };

    // 2) Treasury balance.
    const [treasuryPlayer] = await db
      .select({ balanceCrc: players.balanceCrc })
      .from(players)
      .where(eq(players.address, DAO_TREASURY_ADDRESS))
      .limit(1);
    const treasuryBalance = treasuryPlayer?.balanceCrc ?? 0;

    // 3) Safe on-chain CRC (ERC-1155 NF tokenId).
    let safeCrcBalance: number | null = null;
    let safeError: string | null = null;
    try {
      const { erc1155 } = await getSafeCrcBalance();
      safeCrcBalance = parseFloat(ethers.formatEther(erc1155));
    } catch (err: any) {
      safeError = err?.message || "rpc_error";
    }

    const totalDbBalances = Number(userRow.total) + Number(treasuryBalance);
    const diff =
      safeCrcBalance !== null ? Math.round((totalDbBalances - safeCrcBalance) * 1_000_000) / 1_000_000 : null;

    // Balance-pay orphan check: debits in wallet_ledger for multiplayer
    // games whose player address isn't assigned to player1/player2 of the
    // game row. Should always be 0 — payGameFromBalance rolls back the debit
    // on an `already_full` slot. This is a safety-net check to catch future
    // regressions in the transactional path.
    type OrphanSample = {
      gameKey: string;
      gameSlug: string | null;
      ledgerId: number;
      address: string;
      amountCrc: number;
      createdAt: string;
    };
    const orphanSamples: OrphanSample[] = [];
    const orphanByGame: Record<string, { count: number; totalCrc: number }> = {};
    let orphanTotalCount = 0;
    let orphanTotalCrc = 0;

    for (const config of ALL_SERVER_GAMES) {
      const debits = await db
        .select({
          id: walletLedger.id,
          address: walletLedger.address,
          amountCrc: walletLedger.amountCrc,
          gameSlug: walletLedger.gameSlug,
          createdAt: walletLedger.createdAt,
        })
        .from(walletLedger)
        .where(and(eq(walletLedger.kind, "debit"), eq(walletLedger.gameType, config.key)));

      if (debits.length === 0) continue;

      const slugs = [...new Set(debits.map((d) => d.gameSlug).filter((s): s is string => !!s))];
      const gameMap = new Map<string, { player1Address: string | null; player2Address: string | null }>();
      if (slugs.length > 0) {
        const games = await db
          .select({
            slug: config.table.slug,
            player1Address: config.table.player1Address,
            player2Address: config.table.player2Address,
          })
          .from(config.table)
          .where(inArray(config.table.slug, slugs));
        for (const g of games) gameMap.set(g.slug, g);
      }

      let gameCount = 0;
      let gameCrc = 0;
      for (const d of debits) {
        const game = d.gameSlug ? gameMap.get(d.gameSlug) : null;
        const addr = d.address.toLowerCase();
        const p1 = game?.player1Address?.toLowerCase() ?? null;
        const p2 = game?.player2Address?.toLowerCase() ?? null;
        const isAssigned = addr === p1 || addr === p2;
        if (isAssigned) continue;

        const lost = Math.abs(d.amountCrc);
        gameCount++;
        gameCrc += lost;
        orphanTotalCount++;
        orphanTotalCrc += lost;
        if (orphanSamples.length < 20) {
          orphanSamples.push({
            gameKey: config.key,
            gameSlug: d.gameSlug,
            ledgerId: d.id,
            address: d.address,
            amountCrc: lost,
            createdAt: d.createdAt.toISOString(),
          });
        }
      }
      if (gameCount > 0) orphanByGame[config.key] = { count: gameCount, totalCrc: gameCrc };
    }

    // Secondary ledger-sum invariant (should equal sum of balances).
    const ledgerSumRes = await db.execute(
      sql`SELECT COALESCE(SUM(amount_crc), 0)::float AS total,
                 COUNT(*)::int AS n
          FROM wallet_ledger`,
    );
    const ledgerRow =
      (ledgerSumRes as any).rows?.[0] ?? (ledgerSumRes as any)[0] ?? { total: 0, n: 0 };
    const ledgerVsBalance = Math.round((Number(ledgerRow.total) - totalDbBalances) * 1_000_000) / 1_000_000;

    return NextResponse.json({
      users: {
        count: Number(userRow.n),
        totalBalanceCrc: Number(userRow.total),
        negativeCount: Number(userRow.n_negative),
      },
      treasury: {
        address: DAO_TREASURY_ADDRESS,
        balanceCrc: Number(treasuryBalance),
      },
      safeOnchain: {
        balanceCrc: safeCrcBalance,
        error: safeError,
      },
      ledger: {
        entries: Number(ledgerRow.n),
        sumCrc: Number(ledgerRow.total),
        /** Drift between ledger sum and players.balance_crc sum. Should be 0. */
        drift: ledgerVsBalance,
      },
      invariant: {
        /** sum(user balances) + treasury. */
        totalDbBalanceCrc: totalDbBalances,
        /** totalDbBalance - Safe_onchain. 0 means perfect, >0 means DB shows more than chain
         *  (possibly over-credited somewhere), <0 means Safe holds more than DB claims
         *  (normal for house-edge accumulated before Phase 3e treasury tracking). */
        diffVsSafeCrc: diff,
      },
      balanceDebitOrphans: {
        /** Debits charged to a player whose address isn't assigned to either
         *  slot of the target multiplayer game. Should always be 0 — if not,
         *  the transactional rollback in payGameFromBalance has regressed. */
        count: orphanTotalCount,
        totalCrc: Math.round(orphanTotalCrc * 1_000_000) / 1_000_000,
        byGame: orphanByGame,
        samples: orphanSamples,
      },
    });
  } catch (error: any) {
    console.error("[WalletHealth] Error:", error?.message);
    return NextResponse.json({ error: "internal_error", message: error?.message }, { status: 500 });
  }
}
