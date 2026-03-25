import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { eq, and, isNotNull } from "drizzle-orm";
import { todayString } from "@/lib/daily";

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

    // Trigger scan inline
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      await fetch(`${base}/api/daily/scan`, { method: "POST" });
    } catch { /* scan fail silencieux */ }

    // Re-check this session after scan
    const [updated] = await db
      .select()
      .from(dailySessions)
      .where(eq(dailySessions.token, token))
      .limit(1);

    if (updated?.address) {
      return confirmedResponse(updated);
    }

    // Still not confirmed — check if user already has a confirmed session today
    // (handles: reload, clear cache, different device)
    const today = todayString();
    const [existingConfirmed] = await db
      .select()
      .from(dailySessions)
      .where(and(
        eq(dailySessions.date, today),
        isNotNull(dailySessions.address),
      ))
      .limit(1);

    if (existingConfirmed) {
      // Copy the confirmed data to the current session so the token stays consistent
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

    return NextResponse.json({ status: "waiting" });
  } catch (error: any) {
    console.error("[Daily Session] Error:", error.message);
    return NextResponse.json({ error: error.message || "Session check failed" }, { status: 500 });
  }
}
