export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { nfAuthTokens, claimedPayments } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { generateGamePaymentLink, checkAllNewPayments } from "@/lib/circles";
import { executePayout } from "@/lib/payout";
import QRCode from "qrcode";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";
const SESSION_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "NFA-";
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return result;
}

// POST — create auth session for ticket recovery
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "nf-auth", 5, 60000);
  if (limited) return limited;

  try {
    const token = generateToken();
    const expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);

    await db.insert(nfAuthTokens).values({ token, expiresAt });

    const paymentLink = generateGamePaymentLink(SAFE_ADDRESS, 1, "nf_auth", token);

    let qrCode = "";
    try {
      qrCode = await QRCode.toDataURL(paymentLink, { width: 300, margin: 2 });
    } catch (qrErr) {
      console.error("[NF Auth] QR generation failed:", qrErr);
    }

    return NextResponse.json({ token, paymentLink, qrCode, recipientAddress: SAFE_ADDRESS });
  } catch (error: any) {
    console.error("[NF Auth] Init error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET — poll auth token status (scans blockchain, matches payment, returns address)
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "nf-auth", 5, 60000);
  if (limited) return limited;

  try {
    const token = req.nextUrl.searchParams.get("token");
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const [session] = await db
      .select()
      .from(nfAuthTokens)
      .where(eq(nfAuthTokens.token, token))
      .limit(1);

    if (!session) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }

    // Already confirmed
    if (session.address) {
      return NextResponse.json({ status: "confirmed", address: session.address });
    }

    // Check expiry
    if (Date.now() > new Date(session.expiresAt).getTime()) {
      return NextResponse.json({ status: "expired" });
    }

    // Scan for nf_auth payments
    try {
      await scanNfAuthPayments();
    } catch (err) {
      console.error("[NF Auth] Scan error:", err);
    }

    const [updated] = await db
      .select()
      .from(nfAuthTokens)
      .where(eq(nfAuthTokens.token, token))
      .limit(1);

    if (updated?.address) {
      return NextResponse.json({ status: "confirmed", address: updated.address });
    }

    return NextResponse.json({ status: "waiting" });
  } catch (error: any) {
    console.error("[NF Auth] Poll error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function scanNfAuthPayments() {
  const newPayments = await checkAllNewPayments(1, SAFE_ADDRESS);

  const candidates = newPayments
    .filter(p => p.gameData?.game === "nf_auth")
    .map(p => p.transactionHash.toLowerCase());

  if (candidates.length === 0) return;

  const globalClaimed = new Set<string>();
  const claimed = await db
    .select({ txHash: claimedPayments.txHash })
    .from(claimedPayments)
    .where(inArray(claimedPayments.txHash, candidates));
  for (const c of claimed) globalClaimed.add(c.txHash.toLowerCase());

  for (const payment of newPayments) {
    if (!payment.gameData || payment.gameData.game !== "nf_auth") continue;

    const txHash = payment.transactionHash.toLowerCase();
    const playerAddress = payment.sender.toLowerCase();
    const token = payment.gameData.id;

    if (globalClaimed.has(txHash)) continue;

    try {
      const val = BigInt(payment.value);
      if (val !== BigInt("1000000000000000000")) continue;
    } catch { continue; }

    const [session] = await db
      .select()
      .from(nfAuthTokens)
      .where(eq(nfAuthTokens.token, token))
      .limit(1);

    if (!session || session.address) continue;

    await db.update(nfAuthTokens).set({
      address: playerAddress,
      txHash,
    }).where(eq(nfAuthTokens.id, session.id));

    await db.insert(claimedPayments).values({
      txHash,
      gameType: "nf_auth",
      gameId: session.id,
      playerAddress,
      amountCrc: 1,
    }).onConflictDoNothing();

    // Auto-refund 1 CRC
    try {
      await executePayout({
        gameType: "nf_auth_refund",
        gameId: `nf-auth-refund-${txHash}`,
        recipientAddress: playerAddress,
        amountCrc: 1,
        reason: "NF Society — vérification d'identité (remboursé)",
      });
    } catch (err) {
      console.error("[NF Auth] Refund error:", err);
    }

    globalClaimed.add(txHash);
  }
}
