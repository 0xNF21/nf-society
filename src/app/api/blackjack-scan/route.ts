export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blackjackTables, blackjackHands, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { checkAllNewPayments } from "@/lib/circles";
import { createDeck, dealInitialHands, getVisibleState } from "@/lib/blackjack";
import type { BlackjackState } from "@/lib/blackjack";

const WEI_PER_CRC = BigInt("1000000000000000000");
// Blackjack-specific start block — reset after cleanup, only scan recent payments
const BLACKJACK_START_BLOCK = "0x2B7DE5C";

export async function POST(req: NextRequest) {
  try {
    const tableSlug = req.nextUrl.searchParams.get("tableSlug");
    if (!tableSlug) return NextResponse.json({ error: "tableSlug required" }, { status: 400 });

    const [table] = await db.select().from(blackjackTables).where(eq(blackjackTables.slug, tableSlug)).limit(1);
    if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });

    const betOptions = (table.betOptions as number[]) || [1, 5, 10, 25];

    // Get existing hands to skip known txs
    const existingHands = await db
      .select({ transactionHash: blackjackHands.transactionHash })
      .from(blackjackHands)
      .where(eq(blackjackHands.tableId, table.id));
    const knownTxHashes = new Set(existingHands.map(h => h.transactionHash.toLowerCase()));

    // Scan for each bet amount separately (checkAllNewPayments filters by exact amount)
    const allPayments = [];
    const seenTx = new Set<string>();
    for (const bet of betOptions) {
      const payments = await checkAllNewPayments(bet, table.recipientAddress, BLACKJACK_START_BLOCK);
      for (const p of payments) {
        const key = p.transactionHash.toLowerCase();
        if (!seenTx.has(key)) {
          seenTx.add(key);
          allPayments.push(p);
        }
      }
    }
    const newPayments = allPayments;

    const candidateTxHashes = newPayments
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

    for (const payment of newPayments) {
      const txHash = payment.transactionHash.toLowerCase();
      const playerAddress = payment.sender.toLowerCase();

      if (knownTxHashes.has(txHash)) continue;
      if (globalClaimed.has(txHash)) continue;

      // Check game data — only accept initial bets, skip double/split extra payments
      if (payment.gameData) {
        if (payment.gameData.game !== "blackjack") continue;
        if (!payment.gameData.id.startsWith(table.slug)) continue;
        // Skip double/split payments — they contain "-double-" or "-split-" in the id
        if (payment.gameData.id.includes("-double-") || payment.gameData.id.includes("-split-")) continue;
      }

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

      // Extract player token from payment data
      const playerToken = payment.gameData?.t || null;

      // Deal initial hand
      const deck = createDeck(6);
      const state = dealInitialHands(deck, betCrc);

      try {
        const inserted = await db.insert(blackjackHands).values({
          tableId: table.id,
          playerAddress,
          transactionHash: txHash,
          betCrc,
          playerToken,
          gameState: state as unknown as Record<string, unknown>,
          status: state.status,
          outcome: state.status === "finished" ? (state.playerHands[0]?.outcome || null) : null,
          payoutCrc: state.status === "finished" ? state.totalPayout : null,
        }).onConflictDoNothing().returning({ id: blackjackHands.id });

        if (inserted.length === 0) {
          knownTxHashes.add(txHash);
          continue;
        }

        knownTxHashes.add(txHash);
        globalClaimed.add(txHash);
        created.push({ id: inserted[0].id, playerAddress, betCrc });

        await db.insert(claimedPayments).values({
          txHash,
          gameType: "blackjack",
          gameId: table.id,
          playerAddress,
          amountCrc: betCrc,
        }).onConflictDoNothing();

        // If already finished (natural blackjack or dealer blackjack), process payout
        if (state.status === "finished" && state.totalPayout > 0) {
          const { executePayout } = await import("@/lib/payout");
          await executePayout({
            gameType: "blackjack",
            gameId: `blackjack-${table.id}-${txHash}`,
            recipientAddress: playerAddress,
            amountCrc: state.totalPayout,
            reason: `Blackjack ${table.title} — ${state.playerHands[0]?.outcome} ${state.totalPayout} CRC`,
          });

          await db.update(blackjackHands).set({
            payoutStatus: "success",
          }).where(eq(blackjackHands.id, inserted[0].id));
        }

        // XP
        try {
          const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          await fetch(`${base}/api/players/xp`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address: playerAddress, action: "blackjack_play" }),
          });
        } catch {}

      } catch (err: any) {
        console.error("[BlackjackScan] Error:", err.message);
      }
    }

    return NextResponse.json({ created: created.length, results: created });
  } catch (error: any) {
    console.error("[BlackjackScan] Fatal:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
