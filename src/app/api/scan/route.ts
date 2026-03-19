import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participants, lotteries, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";

const LOTTERY_START_TIMESTAMP = 1739404800;
const WEI_PER_CRC = BigInt("1000000000000000000");

export async function POST(req: NextRequest) {
  try {
    const lotteryIdParam = req.nextUrl.searchParams.get("lotteryId");
    const lotteryId = lotteryIdParam ? parseInt(lotteryIdParam, 10) : null;

    if (!lotteryId) {
      return NextResponse.json({ error: "lotteryId is required" }, { status: 400 });
    }

    const [lottery] = await db
      .select()
      .from(lotteries)
      .where(eq(lotteries.id, lotteryId))
      .limit(1);

    if (!lottery) {
      return NextResponse.json({ error: "Lottery not found" }, { status: 404 });
    }

    const recipientAddress = lottery.recipientAddress;
    const ticketPriceCrc = lottery.ticketPriceCrc;

    const ticketPriceWei = BigInt(ticketPriceCrc) * WEI_PER_CRC;

    const existingParticipants = await db
      .select({ address: participants.address, transactionHash: participants.transactionHash })
      .from(participants)
      .where(eq(participants.lotteryId, lotteryId));
    const registeredTxHashes = new Set(
      existingParticipants.map((p) => p.transactionHash.toLowerCase())
    );
    const registeredAddresses = new Set(
      existingParticipants.map((p) => p.address.toLowerCase())
    );

    const newPayments = await checkAllNewPayments(ticketPriceCrc, recipientAddress);

    // Query claimedPayments only for the txHashes we need, not the full table
    const candidateTxHashes = newPayments
      .map((p) => p.transactionHash.toLowerCase())
      .filter((h) => !registeredTxHashes.has(h));

    const globalClaimedTxHashes = new Set<string>();
    if (candidateTxHashes.length > 0) {
      const claimed = await db
        .select({ txHash: claimedPayments.txHash })
        .from(claimedPayments)
        .where(inArray(claimedPayments.txHash, candidateTxHashes));
      for (const c of claimed) globalClaimedTxHashes.add(c.txHash.toLowerCase());
    }

    let added = 0;
    for (const payment of newPayments) {
      const txHash = payment.transactionHash.toLowerCase();
      const addr = payment.sender.toLowerCase();

      if (registeredTxHashes.has(txHash)) continue;
      if (globalClaimedTxHashes.has(txHash)) continue;
      if (registeredAddresses.has(addr)) continue;

      if (payment.gameData) {
        if (payment.gameData.game !== "lottery" || payment.gameData.id !== lottery.slug) continue;
      }

      const hasTimestamp = payment.timestamp && payment.timestamp !== "";
      const hasBlockNumber = payment.blockNumber && payment.blockNumber !== "";

      if (hasTimestamp) {
        const eventTimestamp = parseInt(payment.timestamp, 10) || parseInt(payment.timestamp, 16) || 0;
        if (eventTimestamp < LOTTERY_START_TIMESTAMP) continue;
      } else if (!hasBlockNumber) {
        continue;
      }

      try {
        const val = BigInt(payment.value);
        if (val !== ticketPriceWei) continue;
      } catch {
        continue;
      }

      let paidAt: Date;
      if (hasTimestamp) {
        const rawTs = parseInt(payment.timestamp, 10) || parseInt(payment.timestamp, 16) || 0;
        paidAt = new Date(rawTs * 1000);
      } else {
        paidAt = new Date();
      }

      try {
        await db.insert(participants).values({
          lotteryId: lotteryId,
          address: addr,
          transactionHash: txHash,
          paidAt,
        }).onConflictDoNothing();

        await db.insert(claimedPayments).values({
          txHash,
          gameType: "lottery",
          gameId: lotteryId,
          playerAddress: addr,
          amountCrc: ticketPriceCrc,
        }).onConflictDoNothing();

        added++;
        registeredAddresses.add(addr);
        registeredTxHashes.add(txHash);
        globalClaimedTxHashes.add(txHash);
      } catch {
        continue;
      }
    }

    const countResult = await db
      .select({ id: participants.id })
      .from(participants)
      .where(eq(participants.lotteryId, lotteryId));
    return NextResponse.json({ added, total: countResult.length });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
