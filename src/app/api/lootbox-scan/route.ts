export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { lootboxes, lootboxOpens, claimedPayments, shopCoupons } from "@/lib/db/schema";
import { eq, and, inArray, gt } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { creditPrize, creditWallet } from "@/lib/wallet";
import { getRandomReward } from "@/lib/lootbox";
import { getLootboxXpAction } from "@/lib/xp";

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

      // Extract player token from payment data
      const playerToken = payment.gameData?.t || null;

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
          playerToken,
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

        try {
          const creditResult = await creditPrize(
            playerAddress,
            rewardCrc,
            { gameType: "lootbox", gameSlug: String(lootboxId), gameRef: `open-${txHash}` },
          );
          await db.update(lootboxOpens).set({
            payoutStatus: "success",
            payoutTxHash: creditResult.ok
              ? `balance-credit:${creditResult.ledgerId}`
              : "balance-credit:duplicate",
            errorMessage: null,
          }).where(eq(lootboxOpens.transactionHash, txHash));
        } catch (err: any) {
          console.error("[LootboxScan] Credit error:", err.message);
          await db.update(lootboxOpens).set({
            payoutStatus: "failed",
            errorMessage: err.message?.substring(0, 500),
          }).where(eq(lootboxOpens.transactionHash, txHash));
        }

        // ─── Coupon refund check ───
        try {
          const [coupon] = await db
            .select()
            .from(shopCoupons)
            .where(
              and(
                eq(shopCoupons.address, playerAddress),
                eq(shopCoupons.used, false),
                gt(shopCoupons.expiresAt, new Date()),
                // lootbox_refund or lootbox_rare_refund
              )
            )
            .limit(1);

          if (coupon && (coupon.type === "lootbox_refund" || coupon.type === "lootbox_rare_refund")) {
            // Consume coupon
            await db.update(shopCoupons)
              .set({ used: true, usedAt: new Date(), txHashUsed: txHash })
              .where(eq(shopCoupons.id, coupon.id));

            // Refund the lootbox price to the player's balance (coupon-triggered).
            try {
              await creditWallet(playerAddress, priceCrc, {
                kind: "cashout-refund",
                reason: `Lootbox remboursee (coupon) — ${lootbox.title}`,
                txHash: `shop-refund:${txHash}`,
                gameType: "shop_refund",
                gameSlug: String(lootboxId),
              });
            } catch (refundErr: any) {
              console.error("[LootboxScan] Coupon refund credit error:", refundErr.message);
            }
          }
        } catch (couponErr) {
          console.error("[LootboxScan] Coupon refund error:", couponErr);
        }

        // XP non-bloquant — ne doit jamais bloquer le payout
        try {
          const base = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}`;
          await fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: playerAddress, action: "lootbox_open" }),
          });
          const bonusAction = getLootboxXpAction(rewardCrc, priceCrc);
          if (bonusAction) {
            await fetch(`${base}/api/players/xp`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ address: playerAddress, action: bonusAction }),
            });
          }
        } catch { /* XP fail silencieux */ }
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
