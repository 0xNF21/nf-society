import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { eq, and, isNull, desc, isNotNull } from "drizzle-orm";
import { generateDailyToken, todayString } from "@/lib/daily";
import { generateGamePaymentLink } from "@/lib/circles";
import QRCode from "qrcode";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";

export async function POST() {
  try {
    const date = todayString();

    // 1. Check if there's already a CONFIRMED session today — return it directly
    const [confirmed] = await db
      .select()
      .from(dailySessions)
      .where(and(
        eq(dailySessions.date, date),
        isNotNull(dailySessions.address),
      ))
      .orderBy(desc(dailySessions.id))
      .limit(1);

    if (confirmed) {
      return NextResponse.json({
        token: confirmed.token,
        alreadyConfirmed: true,
        paymentLink: "",
        qrCode: "",
      });
    }

    // 2. Check if there's a pending (waiting) session today — reuse it
    const [pending] = await db
      .select()
      .from(dailySessions)
      .where(and(
        eq(dailySessions.date, date),
        isNull(dailySessions.address),
      ))
      .orderBy(desc(dailySessions.id))
      .limit(1);

    let token: string;
    if (pending) {
      token = pending.token;
    } else {
      // 3. No session at all — create a new one
      token = generateDailyToken();
      await db.insert(dailySessions).values({ token, date });
    }

    const paymentLink = generateGamePaymentLink(SAFE_ADDRESS, 1, "daily", token);

    let qrCode = "";
    try {
      qrCode = await QRCode.toDataURL(paymentLink, { width: 300, margin: 2 });
    } catch { /* QR generation optional */ }

    return NextResponse.json({ token, paymentLink, qrCode });
  } catch (error: any) {
    console.error("[Daily Init] Error:", error.message);
    return NextResponse.json({ error: error.message || "Init failed" }, { status: 500 });
  }
}
