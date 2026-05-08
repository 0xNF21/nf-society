import { db } from "@/lib/db";
import { dailySessions, claimedPayments } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { executePayout } from "@/lib/payout";
import { allowDailyRepeatTests } from "@/lib/daily";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";
const WEI_PER_CRC = BigInt("1000000000000000000");

export async function runDailyScan(): Promise<number> {
  const newPayments = await checkAllNewPayments(1, SAFE_ADDRESS);
  const allowRepeat = allowDailyRepeatTests();
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
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`daily-claim:${playerAddress}:${session.date}`})::bigint)`);

        const [claimedToday] = await tx
          .select({ id: dailySessions.id })
          .from(dailySessions)
          .where(and(
            eq(dailySessions.address, playerAddress),
            eq(dailySessions.date, session.date),
            sql`${dailySessions.txHash} IS NOT NULL`,
          ))
          .orderBy(dailySessions.id)
          .limit(1);

        const claimedInsert = await tx.insert(claimedPayments).values({
          txHash,
          gameType: "daily",
          gameId: session.id,
          playerAddress,
          amountCrc: 1,
        }).onConflictDoNothing().returning({ txHash: claimedPayments.txHash });

        if (claimedInsert.length === 0) {
          return { status: "already_processed" as const };
        }

        if (claimedToday && !allowRepeat) {
          return { status: "duplicate_daily" as const };
        }

        await tx.update(dailySessions).set({
          address: playerAddress,
          txHash: txHash,
        }).where(eq(dailySessions.id, session.id));

        return { status: "confirmed" as const };
      });

      // Jackpot pool disabled — will be reimplemented as independent system
      // await db.insert(jackpotPool).values({ ... });

      globalClaimed.add(txHash);
      if (result.status === "already_processed") continue;
      processed++;

      if (result.status === "duplicate_daily") {
        try {
          await executePayout({
            gameType: "daily-duplicate-refund",
            gameId: `daily-duplicate-refund-${session.id}`,
            recipientAddress: playerAddress,
            amountCrc: 1,
            reason: "Duplicate daily claim refund",
          });
        } catch { /* refund fail silencieux â€” sera retry manuellement */ }
        continue;
      }

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
    } catch (err: any) {
      console.error("[DailyScan] Error processing payment:", err.message);
    }
  }

  return processed;
}
