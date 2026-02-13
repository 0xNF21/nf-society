import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { participants } from "@/lib/db/schema";

export async function POST() {
  try {
    const allParticipants = await db.select().from(participants);
    if (allParticipants.length === 0) {
      return NextResponse.json({ error: "No participants yet" }, { status: 404 });
    }

    const winner = allParticipants[Math.floor(Math.random() * allParticipants.length)];
    return NextResponse.json({ winner });
  } catch (error) {
    return NextResponse.json({ error: "Failed to pick winner" }, { status: 500 });
  }
}
