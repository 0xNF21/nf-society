export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { revokeCurrentSession, clearAuthCookie } from "@/lib/auth/session";

/**
 * POST /api/auth/logout
 *
 * Revokes the current session (idempotent) and clears the cookie.
 */
export async function POST(req: NextRequest) {
  try {
    await revokeCurrentSession(req);
    const res = NextResponse.json({ ok: true });
    clearAuthCookie(res);
    return res;
  } catch (error: any) {
    console.error("[auth/logout] error:", error?.message ?? error);
    // Even on error, clear the cookie to avoid stuck-logged-in state.
    const res = NextResponse.json({ ok: true });
    clearAuthCookie(res);
    return res;
  }
}
