import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participants, lotteries } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
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
      .select()
      .from(participants)
      .where(eq(participants.lotteryId, lotteryId));
    const registeredTxHashes = new Set(
      existingParticipants.map((p) => p.transactionHash.toLowerCase())
    );
    const registeredAddresses = new Set(
      existingParticipants.map((p) => p.address.toLowerCase())
    );

    const newPayments = await checkAllNewPayments(ticketPriceCrc, recipientAddress);

    let added = 0;
    for (const payment of newPayments) {
      const txHash = payment.transactionHash.toLowerCase();
      const addr = payment.sender.toLowerCase();

      if (registeredTxHashes.has(txHash)) continue;
      if (registeredAddresses.has(addr)) continue;

      const eventTimestamp = parseInt(payment.timestamp, 16) || parseInt(payment.timestamp, 10) || 0;
      if (eventTimestamp < LOTTERY_START_TIMESTAMP) continue;

      try {
        const val = BigInt(payment.value);
        if (val !== ticketPriceWei) continue;
      } catch {
        continue;
      }

      const rawTs = parseInt(payment.timestamp, 16) || parseInt(payment.timestamp, 10) || 0;
      const paidAt = new Date(rawTs * 1000);

      try {
        await db.insert(participants).values({
          lotteryId: lotteryId,
          address: addr,
          transactionHash: txHash,
          paidAt,
        }).onConflictDoNothing();
        added++;
        registeredAddresses.add(addr);
        registeredTxHashes.add(txHash);
      } catch {
        continue;
      }
    }

    const countResult = await db
      .select()
      .from(participants)
      .where(eq(participants.lotteryId, lotteryId));
    return NextResponse.json({ added, total: countResult.length });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
