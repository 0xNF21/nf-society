export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { rouletteTables, rouletteRounds, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { createInitialState } from "@/lib/roulette";

const WEI_PER_CRC = BigInt("1000000000000000000");
const ROULETTE_START_BLOCK = "0x2B7DE5C";

export async function POST(req: NextRequest) {
  try {
    const tableSlug = req.nextUrl.searchParams.get("tableSlug");
    if (!tableSlug) return NextResponse.json({ error: "tableSlug required" }, { status: 400 });

    const [table] = await db.select().from(rouletteTables).where(eq(rouletteTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    const betOptions = (table.betOptions as number[]) || [1, 5, 10, 25];

    // Get existing rounds to skip known txs
    const existingRounds = await db
      .select({ transactionHash: rouletteRounds.transactionHash })
      .from(rouletteRounds)
      .where(eq(rouletteRounds.tableId, table.id));
    const knownTxHashes = new Set(existingRounds.map(r => r.transactionHash.toLowerCase()));

    // Scan for each bet amount
    const allPayments = [];
    const seenTx = new Set<string>();
    for (const bet of betOptions) {
      const payments = await checkAllNewPayments(bet, table.recipientAddress, ROULETTE_START_BLOCK);
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
      if (payment.gameData.game !== "roulette") continue;
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

      // Create initial state (no bets yet — player sets before spin)
      const state = createInitialState(betCrc);

      try {
        const inserted = await db.insert(rouletteRounds).values({
          tableId: table.id,
          playerAddress,
          transactionHash: txHash,
          betCrc,
          playerToken,
          gameState: state as unknown as Record<string, unknown>,
          status: state.status,
        }).onConflictDoNothing().returning({ id: rouletteRounds.id });

        if (inserted.length === 0) {
          knownTxHashes.add(txHash);
          continue;
        }

        knownTxHashes.add(txHash);
        globalClaimed.add(txHash);
        created.push({ id: inserted[0].id, playerAddress, betCrc });

        await db.insert(claimedPayments).values({
          txHash,
          gameType: "roulette",
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
            body: JSON.stringify({ address: playerAddress, action: "roulette_play" }),
          });
        } catch {}

      } catch (err: any) {
        console.error("[RouletteScan] Error:", err.message);
      }
    }

    return NextResponse.json({ created: created.length, results: created });
  } catch (error: any) {
    console.error("[RouletteScan] Fatal:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
