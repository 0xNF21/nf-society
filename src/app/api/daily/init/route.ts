import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { generateDailyToken, todayString } from "@/lib/daily";
import { generateGamePaymentLink } from "@/lib/circles";
import QRCode from "qrcode";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";

export async function POST() {
  try {
    const token = generateDailyToken();
    const date = todayString();

    await db.insert(dailySessions).values({ token, date });

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
