import { db } from "@/lib/db";
import { dailySessions, jackpotPool, claimedPayments } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { todayString } from "@/lib/daily";

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

    const today = todayString();
    const [existing] = await db
      .select({ id: dailySessions.id })
      .from(dailySessions)
      .where(and(
        eq(dailySessions.address, playerAddress),
        eq(dailySessions.date, today),
      ))
      .limit(1);

    if (existing) {
      // User already played today but with a different session token
      // Link this new session to their existing confirmed session data
      const [confirmedSession] = await db
        .select()
        .from(dailySessions)
        .where(eq(dailySessions.id, existing.id))
        .limit(1);
      if (confirmedSession && confirmedSession.address) {
        await db.update(dailySessions).set({
          address: confirmedSession.address,
          txHash: confirmedSession.txHash,
          scratchPlayed: confirmedSession.scratchPlayed,
          scratchResult: confirmedSession.scratchResult,
          spinPlayed: confirmedSession.spinPlayed,
          spinResult: confirmedSession.spinResult,
        }).where(eq(dailySessions.id, session.id));
        // Mark tx as claimed so we don't reprocess
        await db.insert(claimedPayments).values({
          txHash,
          gameType: "daily",
          gameId: session.id,
          playerAddress,
          amountCrc: 1,
        }).onConflictDoNothing();
        globalClaimed.add(txHash);
        processed++;
      }
      continue;
    }

    try {
      await db.update(dailySessions).set({
        address: playerAddress,
        txHash: txHash,
      }).where(eq(dailySessions.id, session.id));

      await db.insert(jackpotPool).values({
        address: playerAddress,
        amountCrc: 1,
        txHash: txHash,
        date: today,
      }).onConflictDoNothing();

      await db.insert(claimedPayments).values({
        txHash,
        gameType: "daily",
        gameId: session.id,
        playerAddress,
        amountCrc: 1,
      }).onConflictDoNothing();

      globalClaimed.add(txHash);
      processed++;

      // XP non-bloquant
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await fetch(`${base}/api/players/xp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: playerAddress, action: "daily_checkin" }),
        });
      } catch { /* XP fail silencieux */ }
    } catch (err: any) {
      console.error("[DailyScan] Error processing payment:", err.message);
    }
  }

  return processed;
}
