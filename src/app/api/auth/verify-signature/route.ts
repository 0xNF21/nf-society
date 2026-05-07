export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  verifyMiniAppSignature,
  createAuthSession,
  setAuthCookie,
} from "@/lib/auth/session";

/**
 * POST /api/auth/verify-signature
 *
 * Body :
 *   {
 *     challengeId: number,
 *     signature: "0x...",
 *     address: "0x..."   // address that produced the signature
 *   }
 *
 * Response :
 *   200 { authenticated: true, address }   + Set-Cookie nfs_auth
 *   401 { error: "..." }
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "auth-verify-signature", 10, 60000);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const challengeId = Number(body?.challengeId);
    const signature = typeof body?.signature === "string" ? body.signature : "";
    const address = typeof body?.address === "string" ? body.address : "";

    if (!Number.isInteger(challengeId) || challengeId <= 0) {
      return NextResponse.json({ error: "invalid_challenge_id" }, { status: 400 });
    }

    const result = await verifyMiniAppSignature({
      challengeId,
      signature,
      expectedAddress: address,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const userAgent = req.headers.get("user-agent");
    const session = await createAuthSession({
      address: result.address,
      origin: "miniapp",
      challengeId: result.challenge.id,
      userAgent,
    });

    const res = NextResponse.json({
      authenticated: true,
      address: result.address,
      expiresAt: session.expiresAt.toISOString(),
    });
    setAuthCookie(res, session.token, { expiresAt: session.expiresAt });
    return res;
  } catch (error: any) {
    console.error("[auth/verify-signature] error:", error?.message ?? error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
