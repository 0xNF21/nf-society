export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { crashDashTables, crashDashRounds, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { createInitialState, generateCrashPoint } from "@/lib/crash-dash";

const WEI_PER_CRC = BigInt("1000000000000000000");
const CRASH_DASH_START_BLOCK = "0x2C00000";

export async function POST(req: NextRequest) {
  try {
    const tableSlug = req.nextUrl.searchParams.get("tableSlug");
    if (!tableSlug) return NextResponse.json({ error: "tableSlug required" }, { status: 400 });

    const [table] = await db.select().from(crashDashTables).where(eq(crashDashTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    const betOptions = (table.betOptions as number[]) || [5, 10, 50, 100];

    // Get existing rounds to skip known txs
    const existingRounds = await db
      .select({ transactionHash: crashDashRounds.transactionHash })
      .from(crashDashRounds)
      .where(eq(crashDashRounds.tableId, table.id));
    const knownTxHashes = new Set(existingRounds.map(r => r.transactionHash.toLowerCase()));

    // Scan for each bet amount
    const allPayments = [];
    const seenTx = new Set<string>();
    for (const bet of betOptions) {
      const payments = await checkAllNewPayments(bet, table.recipientAddress, CRASH_DASH_START_BLOCK);
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
      if (payment.gameData.game !== "crash_dash") continue;
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

      // Generate crash point server-side and create initial state
      const crashPoint = generateCrashPoint();
      const state = createInitialState(crashPoint, betCrc);

      try {
        const inserted = await db.insert(crashDashRounds).values({
          tableId: table.id,
          playerAddress,
          transactionHash: txHash,
          betCrc,
          playerToken,
          gameState: state as unknown as Record<string, unknown>,
          status: state.status,
          crashPoint,
        }).onConflictDoNothing().returning({ id: crashDashRounds.id });

        if (inserted.length === 0) {
          knownTxHashes.add(txHash);
          continue;
        }

        knownTxHashes.add(txHash);
        globalClaimed.add(txHash);
        created.push({ id: inserted[0].id, playerAddress, betCrc });

        await db.insert(claimedPayments).values({
          txHash,
          gameType: "crash_dash",
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
            body: JSON.stringify({ address: playerAddress, action: "crash_dash_play" }),
          });
        } catch {}

      } catch (err: any) {
        console.error("[CrashDashScan] Error:", err.message);
      }
    }

    return NextResponse.json({ created: created.length, results: created });
  } catch (error: any) {
    console.error("[CrashDashScan] Fatal:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
