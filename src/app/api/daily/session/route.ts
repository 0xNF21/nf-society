import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

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

    // Check expiry (no address after 1h)
    if (!session.address) {
      const elapsed = Date.now() - new Date(session.createdAt).getTime();
      if (elapsed > SESSION_EXPIRY_MS) {
        return NextResponse.json({ status: "expired" });
      }

      // Trigger scan inline
      try {
        const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        await fetch(`${base}/api/daily/scan`, { method: "POST" });
      } catch { /* scan fail silencieux */ }

      // Re-check after scan
      const [updated] = await db
        .select()
        .from(dailySessions)
        .where(eq(dailySessions.token, token))
        .limit(1);

      if (updated?.address) {
        return NextResponse.json({
          status: "confirmed",
          address: updated.address,
          scratchPlayed: updated.scratchPlayed,
          spinPlayed: updated.spinPlayed,
          scratchResult: updated.scratchResult ? JSON.parse(updated.scratchResult) : null,
          spinResult: updated.spinResult ? JSON.parse(updated.spinResult) : null,
        });
      }

      return NextResponse.json({ status: "waiting" });
    }

    return NextResponse.json({
      status: "confirmed",
      address: session.address,
      scratchPlayed: session.scratchPlayed,
      spinPlayed: session.spinPlayed,
      scratchResult: session.scratchResult ? JSON.parse(session.scratchResult) : null,
      spinResult: session.spinResult ? JSON.parse(session.spinResult) : null,
    });
  } catch (error: any) {
    console.error("[Daily Session] Error:", error.message);
    return NextResponse.json({ error: error.message || "Session check failed" }, { status: 500 });
  }
}
