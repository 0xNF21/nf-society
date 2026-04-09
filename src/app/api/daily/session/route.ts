export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { todayString } from "@/lib/daily";
import { generateGamePaymentLink } from "@/lib/circles";

const SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function confirmedResponse(s: typeof dailySessions.$inferSelect) {
  return NextResponse.json({
    status: "confirmed",
    token: s.token,
    address: s.address,
    scratchPlayed: s.scratchPlayed,
    spinPlayed: s.spinPlayed,
    scratchResult: s.scratchResult ? JSON.parse(s.scratchResult) : null,
    spinResult: s.spinResult ? JSON.parse(s.spinResult) : null,
  });
}

export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token is required" }, { status: 400 });
    }

    const [session] = await db
      .select()
      .from(dailySessions)
      .where(eq(dailySessions.token, token))
      .limit(1);

    if (!session) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    // Already confirmed — return directly
    if (session.address) {
      return confirmedResponse(session);
    }

    // Not confirmed yet — check expiry
    const elapsed = Date.now() - new Date(session.createdAt).getTime();
    if (elapsed > SESSION_EXPIRY_MS) {
      return NextResponse.json({ status: "expired" });
    }

    // Check if THIS user already has a confirmed session today
    const address = req.nextUrl.searchParams.get("address");
    if (address) {
      const today = todayString();
      const [existingConfirmed] = await db
        .select()
        .from(dailySessions)
        .where(and(
          eq(dailySessions.date, today),
          eq(dailySessions.address, address.toLowerCase()),
        ))
        .limit(1);

      if (existingConfirmed) {
        await db.update(dailySessions).set({
          address: existingConfirmed.address,
          txHash: existingConfirmed.txHash,
          scratchPlayed: existingConfirmed.scratchPlayed,
          scratchResult: existingConfirmed.scratchResult,
          spinPlayed: existingConfirmed.spinPlayed,
          spinResult: existingConfirmed.spinResult,
        }).where(eq(dailySessions.id, session.id));

        return confirmedResponse({ ...session, ...existingConfirmed, id: session.id, token: session.token });
      }
    }

    // Return waiting with payment link so frontend can show QR on reload
    const safeAddress = process.env.SAFE_ADDRESS || "";
    const paymentLink = generateGamePaymentLink(safeAddress, 1, "daily", session.token);
    return NextResponse.json({ status: "waiting", paymentLink });
  } catch (error: any) {
    console.error("[Daily Session] Error:", error.message);
    return NextResponse.json({ error: error.message || "Session check failed" }, { status: 500 });
  }
}
