export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participants, draws, lotteries } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getPayoutConfig } from "@/lib/payout";
import { creditPrize, creditCommission } from "@/lib/wallet";

const GNOSIS_RPC = "https://rpc.gnosischain.com";

async function getLatestBlock(): Promise<{ number: number; hash: string }> {
  const res = await fetch(GNOSIS_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBlockByNumber",
      params: ["latest", false],
    }),
  });

  if (!res.ok) throw new Error("Failed to fetch block");
  const data = await res.json();
  if (!data.result) throw new Error("No block data");

  return {
    number: parseInt(data.result.number, 16),
    hash: data.result.hash,
  };
}

function selectWinner(
  blockHash: string,
  participantCount: number
): number {
  const hashHex = blockHash.startsWith("0x") ? blockHash.slice(2) : blockHash;
  const lastBytes = hashHex.slice(-16);
  const value = BigInt("0x" + lastBytes);
  return Number(value % BigInt(participantCount));
}

export async function GET(req: NextRequest) {
  try {
    const lotteryIdParam = req.nextUrl.searchParams.get("lotteryId");
    const lotteryId = lotteryIdParam ? parseInt(lotteryIdParam, 10) : null;

    if (!lotteryId) {
      return NextResponse.json({ draw: null });
    }

    const latestDraw = await db
      .select()
      .from(draws)
      .where(eq(draws.lotteryId, lotteryId))
      .orderBy(desc(draws.id))
      .limit(1);

    if (latestDraw.length === 0) {
      return NextResponse.json({ draw: null });
    }

    const d = latestDraw[0];
    return NextResponse.json({
      draw: {
        winnerAddress: d.winnerAddress,
        proof: {
          blockNumber: d.blockNumber,
          blockHash: d.blockHash,
          participantCount: d.participantCount,
          selectionIndex: d.selectionIndex,
          method: "Winner = BigInt(last 16 hex chars of blockHash) % participantCount",
        },
        drawnAt: d.drawnAt,
      },
    });
  } catch (error: any) {
    console.error("Fetch draw error:", error);
    return NextResponse.json({ draw: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { password, lotteryId: bodyLotteryId } = await req.json();
    const lotteryIdParam = req.nextUrl.searchParams.get("lotteryId");
    const lotteryId = lotteryIdParam
      ? parseInt(lotteryIdParam, 10)
      : bodyLotteryId
        ? parseInt(bodyLotteryId, 10)
        : null;

    if (!lotteryId) {
      return NextResponse.json({ error: "lotteryId is required" }, { status: 400 });
    }

    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminPassword || password !== adminPassword) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const allParticipants = await db
      .select()
      .from(participants)
      .where(eq(participants.lotteryId, lotteryId));

    if (allParticipants.length === 0) {
      return NextResponse.json(
        { error: "No participants yet" },
        { status: 404 }
      );
    }

    const block = await getLatestBlock();
    const winnerIndex = selectWinner(block.hash, allParticipants.length);
    const winner = allParticipants[winnerIndex];

    const addresses = allParticipants.map((p) => p.address).join(",");

    const [insertedDraw] = await db.insert(draws).values({
      lotteryId,
      winnerAddress: winner.address,
      blockNumber: block.number,
      blockHash: block.hash,
      participantCount: allParticipants.length,
      participantAddresses: addresses,
      selectionIndex: winnerIndex,
    }).returning();

    let payoutResult: { success: boolean; status?: string; error?: string; ledgerId?: number } | null = null;
    const config = getPayoutConfig();
    if (config.configured) {
      try {
        const [lottery] = await db.select().from(lotteries).where(eq(lotteries.id, lotteryId)).limit(1);
        if (lottery) {
          const totalPot = lottery.ticketPriceCrc * allParticipants.length;
          const commission = Math.floor(totalPot * (lottery.commissionPercent / 100));
          const prizeAmount = totalPot - commission;

          if (prizeAmount > 0) {
            const creditResult = await creditPrize(winner.address, prizeAmount, {
              gameType: "lottery",
              gameSlug: String(lotteryId),
              gameRef: `draw-${insertedDraw.id}`,
            });
            await creditCommission(commission, {
              gameType: "lottery",
              gameSlug: String(lotteryId),
              gameRef: `draw-${insertedDraw.id}-commission`,
            });
            payoutResult = {
              success: true,
              status: "success",
              ledgerId: creditResult.ok ? creditResult.ledgerId : undefined,
            };
            console.log(`[Draw] Prize credited to balance (ledger ${creditResult.ok ? creditResult.ledgerId : "duplicate"})`);
          }
        }
      } catch (payoutError: any) {
        console.error("[Draw] Auto-credit failed (draw still valid):", payoutError.message);
        payoutResult = { success: false, error: payoutError.message };
      }
    }

    return NextResponse.json({
      winner,
      proof: {
        blockNumber: block.number,
        blockHash: block.hash,
        participantCount: allParticipants.length,
        selectionIndex: winnerIndex,
        method:
          "Winner = BigInt(last 16 hex chars of blockHash) % participantCount",
      },
      payout: payoutResult,
    });
  } catch (error: any) {
    console.error("Draw error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to pick winner" },
      { status: 500 }
    );
  }
}
