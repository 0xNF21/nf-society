import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shopSessions, claimedPayments } from "@/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateGamePaymentLink, checkAllNewPayments } from "@/lib/circles";
import { executePayout } from "@/lib/payout";
import QRCode from "qrcode";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";
const SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "SHOP-";
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

// POST — create auth session
export async function POST() {
  try {
    const token = generateToken();

    await db.insert(shopSessions).values({ token });

    const paymentLink = generateGamePaymentLink(SAFE_ADDRESS, 1, "shop_auth", token);

    let qrCode = "";
    try {
      qrCode = await QRCode.toDataURL(paymentLink, { width: 300, margin: 2 });
    } catch (qrErr) {
      console.error("[Shop Auth] QR generation failed:", qrErr);
    }

    return NextResponse.json({ token, paymentLink, qrCode });
  } catch (error: any) {
    console.error("[Shop Auth] Init error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET — poll session status
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const [session] = await db
      .select()
      .from(shopSessions)
      .where(eq(shopSessions.token, token))
      .limit(1);

    if (!session) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    // Already confirmed
    if (session.address) {
      return NextResponse.json({ status: "confirmed", address: session.address });
    }

    // Check expiry
    const elapsed = Date.now() - new Date(session.createdAt).getTime();
    if (elapsed > SESSION_EXPIRY_MS) {
      return NextResponse.json({ status: "expired" });
    }

    // Scan for payments
    try {
      await scanShopPayments();
    } catch {}

    // Re-check
    const [updated] = await db
      .select()
      .from(shopSessions)
      .where(eq(shopSessions.token, token))
      .limit(1);

    if (updated?.address) {
      return NextResponse.json({ status: "confirmed", address: updated.address });
    }

    return NextResponse.json({ status: "waiting" });
  } catch (error: any) {
    console.error("[Shop Auth] Poll error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Scan blockchain for shop_auth payments
async function scanShopPayments() {
  const newPayments = await checkAllNewPayments(1, SAFE_ADDRESS);

  const candidates = newPayments
    .filter(p => p.gameData?.game === "shop_auth")
    .map(p => p.transactionHash.toLowerCase());

  if (candidates.length === 0) return;

  const globalClaimed = new Set<string>();
  const claimed = await db
    .select({ txHash: claimedPayments.txHash })
    .from(claimedPayments)
    .where(inArray(claimedPayments.txHash, candidates));
  for (const c of claimed) globalClaimed.add(c.txHash.toLowerCase());

  for (const payment of newPayments) {
    if (!payment.gameData || payment.gameData.game !== "shop_auth") continue;

    const txHash = payment.transactionHash.toLowerCase();
    const playerAddress = payment.sender.toLowerCase();
    const token = payment.gameData.id;

    if (globalClaimed.has(txHash)) continue;

    // Validate 1 CRC
    try {
      const val = BigInt(payment.value);
      if (val !== BigInt("1000000000000000000")) continue;
    } catch { continue; }

    // Find session
    const [session] = await db
      .select()
      .from(shopSessions)
      .where(eq(shopSessions.token, token))
      .limit(1);

    if (!session || session.address) continue;

    // Update session
    await db.update(shopSessions).set({
      address: playerAddress,
      txHash: txHash,
    }).where(eq(shopSessions.id, session.id));

    // Claim payment globally
    await db.insert(claimedPayments).values({
      txHash,
      gameType: "shop_auth",
      gameId: session.id,
      playerAddress,
      amountCrc: 1,
    }).onConflictDoNothing();

    // Auto-refund 1 CRC
    try {
      await executePayout({
        gameType: "shop_auth_refund",
        gameId: `shop-auth-refund-${txHash}`,
        recipientAddress: playerAddress,
        amountCrc: 1,
        reason: "Boutique XP — vérification d'identité (remboursé)",
      });

      await db.update(shopSessions).set({ refunded: true })
        .where(eq(shopSessions.id, session.id));
    } catch (err) {
      console.error("[Shop Auth] Refund error:", err);
    }

    globalClaimed.add(txHash);
  }
}
