import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lootboxes, lootboxOpens, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { executePayout } from "@/lib/payout";
import { getRandomReward } from "@/lib/lootbox";

const WEI_PER_CRC = BigInt("1000000000000000000");

export async function POST(req: NextRequest) {
  try {
    const lootboxIdParam = req.nextUrl.searchParams.get("lootboxId");
    if (!lootboxIdParam) {
      return NextResponse.json({ error: "lootboxId is required" }, { status: 400 });
    }
    const lootboxId = parseInt(lootboxIdParam, 10);

    const [lootbox] = await db.select().from(lootboxes).where(eq(lootboxes.id, lootboxId)).limit(1);
    if (!lootbox) {
      return NextResponse.json({ error: "Lootbox not found" }, { status: 404 });
    }

    const priceCrc = lootbox.pricePerOpenCrc;
    const priceWei = BigInt(priceCrc) * WEI_PER_CRC;

    const existingOpens = await db
      .select({ transactionHash: lootboxOpens.transactionHash })
      .from(lootboxOpens)
      .where(eq(lootboxOpens.lootboxId, lootboxId));
    const knownTxHashes = new Set(existingOpens.map((o) => o.transactionHash.toLowerCase()));

    const newPayments = await checkAllNewPayments(priceCrc, lootbox.recipientAddress);

    // Query claimedPayments only for the txHashes we need, not the full table
    const candidateTxHashes = newPayments
      .map((p) => p.transactionHash.toLowerCase())
      .filter((h) => !knownTxHashes.has(h));

    const globalClaimedTxHashes = new Set<string>();
    if (candidateTxHashes.length > 0) {
      const claimed = await db
        .select({ txHash: claimedPayments.txHash })
        .from(claimedPayments)
        .where(inArray(claimedPayments.txHash, candidateTxHashes));
      for (const c of claimed) globalClaimedTxHashes.add(c.txHash.toLowerCase());
    }

    const opened: Array<{ playerAddress: string; rewardCrc: number; transactionHash: string }> = [];

    for (const payment of newPayments) {
      const txHash = payment.transactionHash.toLowerCase();
      const playerAddress = payment.sender.toLowerCase();

      if (knownTxHashes.has(txHash)) continue;
      if (globalClaimedTxHashes.has(txHash)) continue;

      if (payment.gameData) {
        if (payment.gameData.game !== "lootbox" || payment.gameData.id !== lootbox.slug) continue;
      }

      try {
        const val = BigInt(payment.value);
        if (val !== priceWei) continue;
      } catch {
        continue;
      }

      const rewardCrc = getRandomReward(priceCrc);

      let openedAt: Date;
      try {
        const ts = parseInt(payment.timestamp, 10) || parseInt(payment.timestamp, 16) || 0;
        openedAt = ts > 0 ? new Date(ts * 1000) : new Date();
      } catch {
        openedAt = new Date();
      }

      try {
        // Insert first — .returning() tells us if the row was actually inserted or conflict-ignored
        const inserted = await db.insert(lootboxOpens).values({
          lootboxId,
          playerAddress,
          transactionHash: txHash,
          rewardCrc,
          payoutStatus: "pending",
          openedAt,
        }).onConflictDoNothing().returning({ id: lootboxOpens.id });

        if (inserted.length === 0) {
          // Row already existed (concurrent scan) — skip payout to prevent double-pay
          knownTxHashes.add(txHash);
          continue;
        }

        knownTxHashes.add(txHash);
        globalClaimedTxHashes.add(txHash);
        opened.push({ playerAddress, rewardCrc, transactionHash: txHash });

        await db.insert(claimedPayments).values({
          txHash,
          gameType: "lootbox",
          gameId: lootboxId,
          playerAddress,
          amountCrc: priceCrc,
        }).onConflictDoNothing();

        const gameId = `lootbox-${lootboxId}-${txHash}`;
        const payoutResult = await executePayout({
          gameType: "lootbox",
          gameId,
          recipientAddress: playerAddress,
          amountCrc: rewardCrc,
          reason: `Lootbox ${lootbox.title} — reward ${rewardCrc} CRC`,
        });

        await db.update(lootboxOpens).set({
          payoutStatus: payoutResult.success ? "success" : "failed",
          payoutTxHash: payoutResult.transferTxHash || null,
          errorMessage: payoutResult.error || null,
        }).where(eq(lootboxOpens.transactionHash, txHash));
      } catch (err: any) {
        console.error("[LootboxScan] Error processing payment:", err.message);
        await db.update(lootboxOpens).set({
          payoutStatus: "failed",
          errorMessage: err.message?.substring(0, 500),
        }).where(eq(lootboxOpens.transactionHash, txHash)).catch(() => {});
      }
    }

    const total = await db
      .select({ id: lootboxOpens.id })
      .from(lootboxOpens)
      .where(eq(lootboxOpens.lootboxId, lootboxId));
    return NextResponse.json({ opened: opened.length, totalOpens: total.length, results: opened });
  } catch (error: any) {
    console.error("[LootboxScan] Fatal error:", error.message);
    return NextResponse.json({ error: error.message || "Scan failed" }, { status: 500 });
  }
}
