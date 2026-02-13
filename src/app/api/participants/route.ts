import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { sql, desc } from "drizzle-orm";

export async function GET() {
  try {
    const allParticipants = await db
      .select({
        address: participants.address,
        transactionHash: participants.transactionHash,
        paidAt: participants.paidAt,
      })
      .from(participants)
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

export async function POST(req: Request) {
  try {
    const { address, transactionHash, paidAt } = await req.json();
    if (!address || !transactionHash) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await db.insert(participants).values({
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
