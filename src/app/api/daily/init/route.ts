import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";

/**
 * Legacy daily payment bootstrap.
 *
 * The daily reward is now free for authenticated users and starts through
 * /api/daily/claim. Keep this route explicit so old clients do not create
 * unpaid sessions or show a payment QR code.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "daily-init", 30, 60000);
  if (limited) return limited;

  return NextResponse.json(
    { error: "daily_payment_disabled", message: "Daily rewards are free after sign-in." },
    { status: 410 },
  );
}
