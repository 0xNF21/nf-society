import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lootboxes, lootboxOpens, claimedPayments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { executePayout } from "@/lib/payout";

const WEI_PER_CRC = BigInt("1000000000000000000");

// RTP ~98% for 10 CRC price
// Reward table is relative to price for flexibility
function getRewardTable(priceCrc: number): Array<{ threshold: number; reward: number }> {
  return [
    { threshold: 60,  reward: Math.round(priceCrc * 0.7) },   // 60% → 70% of price
    { threshold: 85,  reward: Math.round(priceCrc * 0.9) },   // 25% → 90% of price
    { threshold: 95,  reward: Math.round(priceCrc * 1.4) },   // 10% → 140% of price
    { threshold: 99,  reward: Math.round(priceCrc * 3.0) },   // 4%  → 300% of price
    { threshold: 100, reward: Math.round(priceCrc * 7.0) },   // 1%  → 700% of price (jackpot)
  ];
}

export function getRandomReward(priceCrc: number): number {
  const rand = Math.random() * 100;
  const table = getRewardTable(priceCrc);
  for (const entry of table) {
    if (rand < entry.threshold) return entry.reward;
  }
  return table[table.length - 1].reward;
}

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

    const existingOpens = await db.select().from(lootboxOpens).where(eq(lootboxOpens.lootboxId, lootboxId));
    const knownTxHashes = new Set(existingOpens.map((o) => o.transactionHash.toLowerCase()));

    const allClaimed = await db.select().from(claimedPayments);
    const globalClaimedTxHashes = new Set(allClaimed.map((c) => c.txHash.toLowerCase()));

    const newPayments = await checkAllNewPayments(priceCrc, lootbox.recipientAddress);

    const opened: Array<{ playerAddress: string; rewardCrc: number; transactionHash: string }> = [];

    for (const payment of newPayments) {
      const txHash = payment.transactionHash.toLowerCase();
      const playerAddress = payment.sender.toLowerCase();

      if (knownTxHashes.has(txHash)) continue;
      if (globalClaimedTxHashes.has(txHash)) continue;

      // Verify exact price match
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
        await db.insert(lootboxOpens).values({
          lootboxId,
          playerAddress,
          transactionHash: txHash,
          rewardCrc,
          payoutStatus: "pending",
          openedAt,
        }).onConflictDoNothing();

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

        // Trigger payout via Safe bot
        // Ici sera connecté : bot backend payout via Safe + Zodiac Roles Modifier
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

    const total = await db.select().from(lootboxOpens).where(eq(lootboxOpens.lootboxId, lootboxId));
    return NextResponse.json({ opened: opened.length, totalOpens: total.length, results: opened });
  } catch (error: any) {
    console.error("[LootboxScan] Fatal error:", error.message);
    return NextResponse.json({ error: error.message || "Scan failed" }, { status: 500 });
  }
}
