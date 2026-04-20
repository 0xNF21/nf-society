export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { coinFlipTables, coinFlipResults, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { resolveCoinFlip, isValidChoice } from "@/lib/coin-flip";
import type { CoinSide } from "@/lib/coin-flip";

const WEI_PER_CRC = BigInt("1000000000000000000");
// Start block — set to a recent block, only scan recent payments
const COIN_FLIP_START_BLOCK = "0x2B7DE5C";

export async function POST(req: NextRequest) {
  try {
    const tableSlug = req.nextUrl.searchParams.get("tableSlug");
    if (!tableSlug) return NextResponse.json({ error: "tableSlug required" }, { status: 400 });

    const [table] = await db.select().from(coinFlipTables).where(eq(coinFlipTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    const betOptions = (table.betOptions as number[]) || [1, 5, 10, 25];

    // Get existing results to skip known txs
    const existingResults = await db
      .select({ transactionHash: coinFlipResults.transactionHash })
      .from(coinFlipResults)
      .where(eq(coinFlipResults.tableId, table.id));
    const knownTxHashes = new Set(existingResults.map(r => r.transactionHash.toLowerCase()));

    // Scan for each bet amount
    const allPayments = [];
    const seenTx = new Set<string>();
    for (const bet of betOptions) {
      const payments = await checkAllNewPayments(bet, table.recipientAddress, COIN_FLIP_START_BLOCK);
      for (const p of payments) {
        const key = p.transactionHash.toLowerCase();
        if (!seenTx.has(key)) {
          seenTx.add(key);
          allPayments.push(p);
        }
      }
    }

    const candidateTxHashes = allPayments
      .map(p => p.transactionHash.toLowerCase())
      .filter(h => !knownTxHashes.has(h));

    const globalClaimed = new Set<string>();
    if (candidateTxHashes.length > 0) {
      const claimed = await db
        .select({ txHash: claimedPayments.txHash })
        .from(claimedPayments)
        .where(inArray(claimedPayments.txHash, candidateTxHashes));
      for (const c of claimed) globalClaimed.add(c.txHash.toLowerCase());
    }

    const created: Array<{ id: number; playerAddress: string; betCrc: number; outcome: string; payoutCrc: number }> = [];

    for (const payment of allPayments) {
      const txHash = payment.transactionHash.toLowerCase();
      const playerAddress = payment.sender.toLowerCase();

      if (knownTxHashes.has(txHash)) continue;
      if (globalClaimed.has(txHash)) continue;

      // Require valid gameData
      if (!payment.gameData) continue;
      if (payment.gameData.game !== "coin_flip") continue;

      // Parse choice from gameData.id: "{slug}-H" or "{slug}-T"
      const gameDataId = payment.gameData.id || "";
      const choiceSuffix = gameDataId.slice(-2);
      if (choiceSuffix !== "-H" && choiceSuffix !== "-T") continue;
      const tableSlugFromData = gameDataId.slice(0, -2);
      if (tableSlugFromData !== table.slug) continue;

      const playerChoice: CoinSide = choiceSuffix === "-H" ? "heads" : "tails";

      // Check amount matches a valid bet option
      let betCrc = 0;
      try {
        const val = BigInt(payment.value);
        for (const opt of betOptions) {
          if (val === BigInt(opt) * WEI_PER_CRC) {
            betCrc = opt;
            break;
          }
        }
        if (betCrc === 0) continue;
      } catch { continue; }

      // Extract player token
      const playerToken = payment.gameData?.t || null;

      // Resolve the coin flip
      const result = resolveCoinFlip(playerChoice, betCrc);

      try {
        const inserted = await db.insert(coinFlipResults).values({
          tableId: table.id,
          playerAddress,
          transactionHash: txHash,
          betCrc,
          playerToken,
          playerChoice: result.playerChoice,
          coinResult: result.coinResult,
          outcome: result.outcome,
          payoutCrc: result.payoutCrc > 0 ? result.payoutCrc : null,
          payoutStatus: result.outcome === "loss" ? "none" : "pending",
        }).onConflictDoNothing().returning({ id: coinFlipResults.id });

        if (inserted.length === 0) {
          knownTxHashes.add(txHash);
          continue;
        }

        knownTxHashes.add(txHash);
        globalClaimed.add(txHash);
        created.push({ id: inserted[0].id, playerAddress, betCrc, outcome: result.outcome, payoutCrc: result.payoutCrc });

        await db.insert(claimedPayments).values({
          txHash,
          gameType: "coin_flip",
          gameId: table.id,
          playerAddress,
          amountCrc: betCrc,
        }).onConflictDoNothing();

        // Coin flip is resolved instantly. Scan fires only on on-chain tx,
        // so the prize is paid on-chain to match the payment method.
        if (result.outcome === "win" && result.payoutCrc > 0) {
          const { executePayout } = await import("@/lib/payout");
          await executePayout({
            gameType: "coin_flip",
            gameId: `coin_flip-${table.id}-${txHash}`,
            recipientAddress: playerAddress,
            amountCrc: result.payoutCrc,
            reason: `Coin Flip ${table.title} — win ${result.payoutCrc} CRC`,
          });

          await db.update(coinFlipResults).set({
            payoutStatus: "success",
          }).where(eq(coinFlipResults.id, inserted[0].id));
        }

        // XP
        try {
          const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          // Fire-and-forget — never block the scan response on XP.
          void fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: playerAddress, action: "coin_flip_play" }),
          }).catch(() => {});
          if (result.outcome === "win") {
            void fetch(`${base}/api/players/xp`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ address: playerAddress, action: "coin_flip_win" }),
            }).catch(() => {});
          }
        } catch {}

      } catch (err: any) {
        console.error("[CoinFlipScan] Error:", err.message);
      }
    }

    return NextResponse.json({ created: created.length, results: created });
  } catch (error: any) {
    console.error("[CoinFlipScan] Fatal:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
