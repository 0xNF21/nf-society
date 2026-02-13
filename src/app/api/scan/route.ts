import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { checkAllNewPayments } from "@/lib/circles";

const LOTTERY_START_TIMESTAMP = 1739404800;
const TICKET_PRICE_CRC = 5;
const WEI_PER_CRC = BigInt("1000000000000000000");
const TICKET_PRICE_WEI = BigInt(TICKET_PRICE_CRC) * WEI_PER_CRC;
const RECIPIENT = "0xbf57dc790ba892590c640dc27b26b2665d30104f";

export async function POST() {
  try {
    const existingParticipants = await db.select().from(participants);
    const registeredTxHashes = new Set(
      existingParticipants.map((p) => p.transactionHash.toLowerCase())
    );
    const registeredAddresses = new Set(
      existingParticipants.map((p) => p.address.toLowerCase())
    );

    const newPayments = await checkAllNewPayments(TICKET_PRICE_CRC, RECIPIENT);

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
        if (val !== TICKET_PRICE_WEI) continue;
      } catch {
        continue;
      }

      try {
        await db.insert(participants).values({
          address: addr,
          transactionHash: txHash,
        }).onConflictDoNothing();
        added++;
        registeredAddresses.add(addr);
        registeredTxHashes.add(txHash);
      } catch {
        continue;
      }
    }

    const countResult = await db.select().from(participants);
    return NextResponse.json({ added, total: countResult.length });
  } catch (error) {
    console.error("Scan error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
