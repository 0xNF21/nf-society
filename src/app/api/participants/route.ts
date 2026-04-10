export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const lotteryIdParam = req.nextUrl.searchParams.get("lotteryId");
    const lotteryId = lotteryIdParam ? parseInt(lotteryIdParam, 10) : null;
    const token = req.nextUrl.searchParams.get("token");

    if (!lotteryId) {
      return NextResponse.json({ count: 0, participants: [], registeredTxHashes: [] });
    }

    // Always get total count (all participants)
    const allParticipants = await db
      .select({
        address: participants.address,
        transactionHash: participants.transactionHash,
        paidAt: participants.paidAt,
      })
      .from(participants)
      .where(eq(participants.lotteryId, lotteryId))
      .orderBy(desc(participants.paidAt));

    const registeredTxHashes = allParticipants.map((p) => p.transactionHash.toLowerCase());

    // If token provided, find the player's own ticket
    let myTicket = null;
    if (token) {
      const [mine] = await db
        .select({ address: participants.address, transactionHash: participants.transactionHash })
        .from(participants)
        .where(and(eq(participants.lotteryId, lotteryId), eq(participants.playerToken, token)))
        .limit(1);
      if (mine) myTicket = mine;
    }

    return NextResponse.json({
      count: allParticipants.length,
      participants: allParticipants,
      registeredTxHashes,
      myTicket,
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch participants" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { address, transactionHash, paidAt, lotteryId } = await req.json();
    if (!address || !transactionHash || !lotteryId) {
      return NextResponse.json({ error: "Missing fields (address, transactionHash, lotteryId required)" }, { status: 400 });
    }

    await db.insert(participants).values({
      lotteryId: parseInt(lotteryId, 10),
      address,
      transactionHash,
      paidAt: paidAt ? new Date(paidAt) : new Date(),
    }).onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving participant:", error);
    return NextResponse.json({ error: "Failed to save participant" }, { status: 500 });
  }
}
