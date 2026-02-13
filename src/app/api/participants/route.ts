import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participants } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    const result = await db.select({ count: sql<number>`count(*)` }).from(participants);
    const allParticipants = await db.select({ transactionHash: participants.transactionHash }).from(participants);
    const registeredTxHashes = allParticipants.map((p) => p.transactionHash.toLowerCase());
    return NextResponse.json({ count: Number(result[0].count), registeredTxHashes });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch count" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { address, transactionHash } = await req.json();
    if (!address || !transactionHash) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    await db.insert(participants).values({
      address,
      transactionHash,
    }).onConflictDoNothing();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving participant:", error);
    return NextResponse.json({ error: "Failed to save participant" }, { status: 500 });
  }
}
