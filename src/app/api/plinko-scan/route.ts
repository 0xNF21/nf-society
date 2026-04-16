export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { plinkoTables, plinkoRounds, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { createInitialState } from "@/lib/plinko";

const WEI_PER_CRC = BigInt("1000000000000000000");
const PLINKO_START_BLOCK = "0x2B7DE5C";

export async function POST(req: NextRequest) {
  try {
    const tableSlug = req.nextUrl.searchParams.get("tableSlug");
    if (!tableSlug) return NextResponse.json({ error: "tableSlug required" }, { status: 400 });

    const [table] = await db.select().from(plinkoTables).where(eq(plinkoTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    const betOptions = (table.betOptions as number[]) || [1, 5, 10, 25];

    // Get existing rounds to skip known txs
    const existingRounds = await db
      .select({ transactionHash: plinkoRounds.transactionHash })
      .from(plinkoRounds)
      .where(eq(plinkoRounds.tableId, table.id));
    const knownTxHashes = new Set(existingRounds.map(r => r.transactionHash.toLowerCase()));

    // Scan for each bet amount
    const allPayments = [];
    const seenTx = new Set<string>();
    for (const bet of betOptions) {
      const payments = await checkAllNewPayments(bet, table.recipientAddress, PLINKO_START_BLOCK);
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
      if (payment.gameData.game !== "plinko") continue;
      if (payment.gameData.id !== table.slug) continue;

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

      // Extract ball value (default 1 CRC/ball if not specified)
      let ballValue = typeof payment.gameData?.bv === "number" && payment.gameData.bv > 0
        ? payment.gameData.bv
        : 1;

      // Ensure ball value divides bet evenly; if not, fall back to 1
      if (betCrc % ballValue !== 0 || ballValue > betCrc) {
        ballValue = 1;
      }

      // Create initial state (player hasn't dropped yet)
      let state;
      try {
        state = createInitialState(betCrc, ballValue);
      } catch {
        continue;
      }

      try {
        const inserted = await db.insert(plinkoRounds).values({
          tableId: table.id,
          playerAddress,
          transactionHash: txHash,
          betCrc,
          ballValue,
          playerToken,
          gameState: state as unknown as Record<string, unknown>,
          status: state.status,
        }).onConflictDoNothing().returning({ id: plinkoRounds.id });

        if (inserted.length === 0) {
          knownTxHashes.add(txHash);
          continue;
        }

        knownTxHashes.add(txHash);
        globalClaimed.add(txHash);
        created.push({ id: inserted[0].id, playerAddress, betCrc });

        await db.insert(claimedPayments).values({
          txHash,
          gameType: "plinko",
          gameId: table.id,
          playerAddress,
          amountCrc: betCrc,
        }).onConflictDoNothing();

        // XP
        try {
          const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          await fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: playerAddress, action: "plinko_play" }),
          });
        } catch {}

      } catch (err: any) {
        console.error("[PlinkoScan] Error:", err.message);
      }
    }

    return NextResponse.json({ created: created.length, results: created });
  } catch (error: any) {
    console.error("[PlinkoScan] Fatal:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
