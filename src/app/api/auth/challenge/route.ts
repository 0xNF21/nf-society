export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createAuthChallenge, type AuthMethod, type AuthOrigin } from "@/lib/auth/session";
import { generateGamePaymentLink } from "@/lib/circles";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";

/**
 * POST /api/auth/challenge
 *
 * Body :
 *   {
 *     method: "miniapp_sign_message" | "payment_1crc",
 *     origin?: "miniapp" | "standalone",
 *     expectedAddress?: "0x..."   // optional, helps server-side audit
 *   }
 *
 * Response :
 *   sign_message :
 *     { challengeId, method, message, expiresAt }
 *
 *   payment_1crc :
 *     { challengeId, method, nonce, paymentLink, qrCode, recipientAddress, amountCrc, expiresAt }
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "auth-challenge", 10, 60000);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const method = body?.method as AuthMethod | undefined;
    const origin = (body?.origin as AuthOrigin | undefined) ?? "unknown";
    const expectedAddress = typeof body?.expectedAddress === "string" ? body.expectedAddress : undefined;

    if (method !== "miniapp_sign_message" && method !== "payment_1crc") {
      return NextResponse.json({ error: "invalid_method" }, { status: 400 });
    }

    if (expectedAddress && !/^0x[a-fA-F0-9]{40}$/.test(expectedAddress)) {
      return NextResponse.json({ error: "invalid_expected_address" }, { status: 400 });
    }

    const challenge = await createAuthChallenge({ method, origin, expectedAddress });

    if (method === "miniapp_sign_message") {
      return NextResponse.json({
        challengeId: challenge.id,
        method,
        message: challenge.message,
        expiresAt: challenge.expiresAt.toISOString(),
      });
    }

    // payment_1crc — generate Gnosis payment link + QR for standalone UX.
    if (!SAFE_ADDRESS) {
      return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
    }

    const paymentLink = generateGamePaymentLink(SAFE_ADDRESS, 1, "nf_auth_v2", challenge.nonce);
    let qrCode = "";
    try {
      qrCode = await QRCode.toDataURL(paymentLink, { width: 300, margin: 2 });
    } catch (qrErr) {
      console.error("[auth/challenge] QR generation failed:", qrErr);
    }

    return NextResponse.json({
      challengeId: challenge.id,
      method,
      nonce: challenge.nonce,
      paymentLink,
      qrCode,
      recipientAddress: SAFE_ADDRESS,
      amountCrc: 1,
      expiresAt: challenge.expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("[auth/challenge] error:", error?.message ?? error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
