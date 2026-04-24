export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { respondIfStakesDisabled } from "@/lib/stakes";
import { db } from "@/lib/db";
import { hiloTables, hiloRounds, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { createDeck, dealInitialCard } from "@/lib/hilo";
import type { HiLoState } from "@/lib/hilo";

const WEI_PER_CRC = BigInt("1000000000000000000");
const HILO_START_BLOCK = "0x2B7DE5C";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "hilo-scan", 10, 60000);
  if (limited) return limited;

  const disabled = await respondIfStakesDisabled();
  if (disabled) return disabled;

  try {
    const tableSlug = req.nextUrl.searchParams.get("tableSlug");
    if (!tableSlug) return NextResponse.json({ error: "tableSlug required" }, { status: 400 });

    const [table] = await db.select().from(hiloTables).where(eq(hiloTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    const betOptions = (table.betOptions as number[]) || [1, 5, 10, 25];

    // Get existing rounds to skip known txs
    const existingRounds = await db
      .select({ transactionHash: hiloRounds.transactionHash })
      .from(hiloRounds)
      .where(eq(hiloRounds.tableId, table.id));
    const knownTxHashes = new Set(existingRounds.map(r => r.transactionHash.toLowerCase()));

    // Scan for each bet amount
    const allPayments = [];
    const seenTx = new Set<string>();
    for (const bet of betOptions) {
      const payments = await checkAllNewPayments(bet, table.recipientAddress, HILO_START_BLOCK);
      for (const p of payments) {
        const key = p.transactionHash.toLowerCase();
        if (!seenTx.has(key)) {
          seenTx.add(key);
          allPayments.push(p);
        }
      }
    }

    const candidateTxHashes = allPayments
      .map(p => p.transactionHash.toLowerCase())
      .filter(h => !knownTxHashes.has(h));

    const globalClaimed = new Set<string>();
    if (candidateTxHashes.length > 0) {
      const claimed = await db
        .select({ txHash: claimedPayments.txHash })
        .from(claimedPayments)
        .where(inArray(claimedPayments.txHash, candidateTxHashes));
      for (const c of claimed) globalClaimed.add(c.txHash.toLowerCase());
    }

    const created: Array<{ id: number; playerAddress: string; betCrc: number }> = [];

    for (const payment of allPayments) {
      const txHash = payment.transactionHash.toLowerCase();
      const playerAddress = payment.sender.toLowerCase();

      if (knownTxHashes.has(txHash)) continue;
      if (globalClaimed.has(txHash)) continue;

      // Require valid gameData
      if (!payment.gameData) continue;
      if (payment.gameData.game !== "hilo") continue;
      if (!payment.gameData.id.startsWith(table.slug)) continue;

      // Check amount matches a valid bet option
      let betCrc = 0;
      try {
        const val = BigInt(payment.value);
        for (const opt of betOptions) {
          if (val === BigInt(opt) * WEI_PER_CRC) {
            betCrc = opt;
            break;
          }
        }
        if (betCrc === 0) continue;
      } catch { continue; }

      // Extract player token
      const playerToken = payment.gameData?.t || null;

      // Deal initial card
      const deck = createDeck(1);
      const state = dealInitialCard(deck, betCrc);

      try {
        const inserted = await db.insert(hiloRounds).values({
          tableId: table.id,
          playerAddress,
          transactionHash: txHash,
          betCrc,
          playerToken,
          gameState: state as unknown as Record<string, unknown>,
          status: state.status,
        }).onConflictDoNothing().returning({ id: hiloRounds.id });

        if (inserted.length === 0) {
          knownTxHashes.add(txHash);
          continue;
        }

        knownTxHashes.add(txHash);
        globalClaimed.add(txHash);
        created.push({ id: inserted[0].id, playerAddress, betCrc });

        await db.insert(claimedPayments).values({
          txHash,
          gameType: "hilo",
          gameId: table.id,
          playerAddress,
          amountCrc: betCrc,
        }).onConflictDoNothing();

        // XP — fire-and-forget. Never block the scan response on XP.
        {
          const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          void fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: playerAddress, action: "hilo_play" }),
          }).catch(() => {});
        }

      } catch (err: any) {
        console.error("[HiLoScan] Error:", err.message);
      }
    }

    return NextResponse.json({ created: created.length, results: created });
  } catch (error: any) {
    console.error("[HiLoScan] Fatal:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
