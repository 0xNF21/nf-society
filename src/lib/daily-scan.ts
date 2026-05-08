import { db } from "@/lib/db";
import { dailySessions, jackpotPool, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { executePayout } from "@/lib/payout";
import { awardPlayerXp } from "@/lib/xp-server";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";
const WEI_PER_CRC = BigInt("1000000000000000000");

export async function runDailyScan(): Promise<number> {
  const newPayments = await checkAllNewPayments(1, SAFE_ADDRESS);
  let processed = 0;

  const candidateTxHashes = newPayments
    .filter(p => p.gameData?.game === "daily")
    .map(p => p.transactionHash.toLowerCase());

  if (candidateTxHashes.length === 0) return 0;

  const globalClaimed = new Set<string>();
  const claimed = await db
    .select({ txHash: claimedPayments.txHash })
    .from(claimedPayments)
    .where(inArray(claimedPayments.txHash, candidateTxHashes));
  for (const c of claimed) globalClaimed.add(c.txHash.toLowerCase());

  for (const payment of newPayments) {
    if (!payment.gameData || payment.gameData.game !== "daily") continue;

    const txHash = payment.transactionHash.toLowerCase();
    const playerAddress = payment.sender.toLowerCase();
    const token = payment.gameData.id;

    if (globalClaimed.has(txHash)) continue;

    try {
      const val = BigInt(payment.value);
      if (val !== WEI_PER_CRC) continue;
    } catch { continue; }

    const [session] = await db
      .select()
      .from(dailySessions)
      .where(eq(dailySessions.token, token))
      .limit(1);

    if (!session) continue;
    if (session.address) continue;

    try {
      await db.update(dailySessions).set({
        address: playerAddress,
        txHash: txHash,
      }).where(eq(dailySessions.id, session.id));

      // Jackpot pool disabled — will be reimplemented as independent system
      // await db.insert(jackpotPool).values({ ... });

      await db.insert(claimedPayments).values({
        txHash,
        gameType: "daily",
        gameId: session.id,
        playerAddress,
        amountCrc: 1,
      }).onConflictDoNothing();

      globalClaimed.add(txHash);
      processed++;

      // Refund 1 CRC — non-bloquant
      try {
        await executePayout({
          gameType: "daily-refund",
          gameId: `daily-refund-${session.id}`,
          recipientAddress: playerAddress,
          amountCrc: 1,
          reason: "Daily auth refund",
        });
      } catch { /* refund fail silencieux — sera retry manuellement */ }

      // XP non-bloquant via le helper serveur (evite 401 sur la route gatee).
      try {
        await awardPlayerXp({ address: playerAddress, action: "daily_checkin" });
      } catch { /* XP fail silencieux */ }
    } catch (err: any) {
      console.error("[DailyScan] Error processing payment:", err.message);
    }
  }

  return processed;
}
