export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function confirmedResponse(s: typeof dailySessions.$inferSelect) {
  return NextResponse.json({
    status: "confirmed",
    token: s.token,
    address: s.address,
    wheelPlayed: s.spinPlayed,
    wheelResult: s.spinResult ? JSON.parse(s.spinResult) : null,
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

    // Legacy unpaid daily sessions are no longer payable. The daily flow now
    // requires an authenticated wallet and uses /api/daily/claim directly.
    return NextResponse.json({ status: "expired" });
  } catch (error: any) {
    console.error("[Daily Session] Error:", error.message);
    return NextResponse.json({ error: error.message || "Session check failed" }, { status: 500 });
  }
}
