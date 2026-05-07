export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth/session";

/**
 * GET /api/auth/session
 *
 * Returns the current session info if any. Used by the frontend AuthProvider
 * to hydrate the session state on app load.
 *
 * Response :
 *   200 { authenticated: true, address, origin, expiresAt }
 *   200 { authenticated: false }
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession(req);
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }
    return NextResponse.json({
      authenticated: true,
      address: session.address,
      origin: session.origin,
      expiresAt: session.expiresAt.toISOString(),
      hardExpiresAt: session.hardExpiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("[auth/session] error:", error?.message ?? error);
    return NextResponse.json({ authenticated: false });
  }
}
