import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const lotteryIdParam = req.nextUrl.searchParams.get("lotteryId");
    const lotteryId = lotteryIdParam ? parseInt(lotteryIdParam, 10) : null;

    if (!lotteryId) {
      return NextResponse.json({ count: 0, participants: [], registeredTxHashes: [] });
    }

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

    return NextResponse.json({
      count: allParticipants.length,
      participants: allParticipants,
      registeredTxHashes,
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
