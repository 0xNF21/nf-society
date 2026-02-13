import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { checkAllNewPayments } from "@/lib/circles";

export async function POST() {
  try {
    const existingParticipants = await db.select().from(participants);
    const registeredTxHashes = new Set(
      existingParticipants.map((p) => p.transactionHash.toLowerCase())
    );
    const registeredAddresses = new Set(
      existingParticipants.map((p) => p.address.toLowerCase())
    );

    const newPayments = await checkAllNewPayments(5, "0xbf57dc790ba892590c640dc27b26b2665d30104f");

    let added = 0;
    for (const payment of newPayments) {
      const txHash = payment.transactionHash.toLowerCase();
      const addr = payment.from.toLowerCase();
      if (registeredTxHashes.has(txHash)) continue;
      if (registeredAddresses.has(addr)) continue;

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
