export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { sql, eq } from "drizzle-orm";
import { getSafeCrcBalance } from "@/lib/payout";
import { DAO_TREASURY_ADDRESS } from "@/lib/wallet";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";

function isAdmin(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD;
}

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
  if (!isAdmin(req)) {
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
    });
  } catch (error: any) {
    console.error("[WalletHealth] Error:", error?.message);
    return NextResponse.json({ error: "internal_error", message: error?.message }, { status: 500 });
  }
}
