export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cashoutTokens } from "@/lib/db/schema";
import { generateGamePaymentLink } from "@/lib/circles";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import QRCode from "qrcode";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";
const SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour
const MIN_CASHOUT_CRC = 1;
const MAX_PAYOUT_CRC = parseInt(process.env.MAX_PAYOUT_CRC || "1000", 10);
/** Rate limit — max 5 new cashout sessions per IP per 60 seconds. */
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "CO-";
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

/**
 * POST /api/wallet/cashout-init
 *
 * Body: { amountCrc: number }
 *
 * Creates a cashout session and returns the 1 CRC proof-of-ownership payment
 * link. The user pays 1 CRC to the Safe with data `nf_cashout:{token}`; that
 * payment identifies which wallet the balance should be sent to, and the
 * proof is refunded at the same time as the cashout payout.
 *
 * Success:
 *   200 { token, amountCrc, paymentLink, qrCode, recipientAddress, expiresAt }
 *
 * Errors:
 *   400 { error: "invalid_amount" | "below_minimum" | "above_maximum" }
 *   500 { error: "internal_error" | "safe_address_missing" }
 */
export async function POST(req: NextRequest) {
  try {
    if (!SAFE_ADDRESS) {
      return NextResponse.json({ error: "safe_address_missing" }, { status: 500 });
    }

    // Rate limit by IP — prevents accidental spam or casual abuse. Not a
    // security boundary (see rate-limit.ts docstring); the 1 CRC proof
    // + balance debit are the real gates for value movement.
    const ip = clientIp(req.headers);
    const rl = await checkRateLimit(`cashout-init:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterSec: rl.retryAfterSec, limit: rl.limit },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
      );
    }

    const body = await req.json().catch(() => ({}));
    const amountCrc = Number(body?.amountCrc);
    if (!isFinite(amountCrc) || amountCrc <= 0) {
      return NextResponse.json({ error: "invalid_amount" }, { status: 400 });
    }
    if (amountCrc < MIN_CASHOUT_CRC) {
      return NextResponse.json({ error: "below_minimum", minimum: MIN_CASHOUT_CRC }, { status: 400 });
    }
    if (amountCrc > MAX_PAYOUT_CRC) {
      return NextResponse.json({ error: "above_maximum", maximum: MAX_PAYOUT_CRC }, { status: 400 });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

    const [inserted] = await db.insert(cashoutTokens).values({
      token,
      amountCrc,
      expiresAt,
    }).returning({ id: cashoutTokens.id });

    // Gnosis payment link: sends 1 CRC to Safe with data `nf_cashout:{token}`.
    const paymentLink = generateGamePaymentLink(SAFE_ADDRESS, 1, "nf_cashout", token);

    let qrCode = "";
    try {
      qrCode = await QRCode.toDataURL(paymentLink, { width: 300, margin: 2 });
    } catch (qrErr) {
      console.error("[Cashout] QR generation failed:", qrErr);
    }

    return NextResponse.json({
      id: inserted.id,
      token,
      amountCrc,
      paymentLink,
      qrCode,
      recipientAddress: SAFE_ADDRESS,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error("[Cashout] Init error:", error?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
