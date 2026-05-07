export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and, desc } from "drizzle-orm";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { authChallenges, authSessions, claimedPayments } from "@/lib/db/schema";
import { checkAllNewPayments } from "@/lib/circles";
import { executePayout } from "@/lib/payout";
import {
  verifyPaymentChallenge,
  createAuthSession,
  setAuthCookie,
} from "@/lib/auth/session";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";

/**
 * POST /api/auth/verify-payment
 *
 * Body : { challengeId: number, origin?: "standalone"|"miniapp" }
 *
 * Behavior :
 *   1. Look up challenge.
 *   2. Scan blockchain for nf_auth_v2 payments matching this nonce.
 *   3. If a matching tx is found :
 *      - confirm the challenge (atomic claim)
 *      - create session + set cookie
 *      - queue auto-refund of the 1 CRC (out-of-band, fire-and-forget)
 *   4. Else return waiting/expired.
 *
 * Polled by the front every ~3 sec until status="confirmed".
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "auth-verify-payment", 15, 60000);
  if (limited) return limited;

  try {
    const body = await req.json().catch(() => ({}));
    const challengeId = Number(body?.challengeId);
    const origin = body?.origin === "miniapp" ? "miniapp" : "standalone";

    if (!Number.isInteger(challengeId) || challengeId <= 0) {
      return NextResponse.json({ error: "invalid_challenge_id" }, { status: 400 });
    }

    const [challenge] = await db
      .select()
      .from(authChallenges)
      .where(eq(authChallenges.id, challengeId))
      .limit(1);

    if (!challenge) {
      return NextResponse.json({ status: "not_found" }, { status: 404 });
    }
    if (challenge.method !== "payment_1crc") {
      return NextResponse.json({ error: "wrong_method" }, { status: 400 });
    }
    if (challenge.usedAt && (challenge.status === "confirmed" || challenge.status === "refunded" || challenge.status === "refund_pending" || challenge.status === "refund_failed")) {
      // Idempotent recovery : si le client a perdu le cookie pendant la
      // premiere reponse confirmed (network error apres set-cookie), on
      // re-mint une nouvelle session pour la meme address + nouveau cookie.
      // L'ancienne session reste vivante (orphelin) jusqu'a son expiration —
      // pas grave, le user ne s'en sert plus.
      const [existing] = await db
        .select({ address: authSessions.address })
        .from(authSessions)
        .where(eq(authSessions.lastAuthChallengeId, challenge.id))
        .orderBy(desc(authSessions.createdAt))
        .limit(1);

      if (!existing?.address) {
        // Edge case : challenge confirme mais aucune session retrouvee — etat
        // incoherent, on demande un nouveau challenge plutot que de bricoler.
        return NextResponse.json({ status: "stale_challenge" }, { status: 409 });
      }

      const userAgent = req.headers.get("user-agent");
      const newSession = await createAuthSession({
        address: existing.address,
        origin,
        challengeId: challenge.id,
        userAgent,
      });

      const res = NextResponse.json({
        status: "confirmed",
        authenticated: true,
        address: existing.address,
        expiresAt: newSession.expiresAt.toISOString(),
        recovered: true,
      });
      setAuthCookie(res, newSession.token, { expiresAt: newSession.expiresAt });
      return res;
    }
    if (challenge.expiresAt.getTime() < Date.now()) {
      return NextResponse.json({ status: "expired" });
    }

    // Scan chain for matching tx — same pattern as src/app/api/nf-auth/route.ts.
    let matchedTx: { txHash: string; sender: string } | null = null;
    try {
      matchedTx = await scanForAuthPayment(challenge.nonce);
    } catch (err) {
      console.error("[auth/verify-payment] scan error:", err);
    }

    if (!matchedTx) {
      return NextResponse.json({ status: "waiting" });
    }

    // Verify + atomically claim challenge.
    const verifyResult = await verifyPaymentChallenge({
      challengeId: challenge.id,
      txHash: matchedTx.txHash,
      senderAddress: matchedTx.sender,
    });

    if (!verifyResult.ok) {
      return NextResponse.json({ error: verifyResult.error, status: "rejected" }, { status: 401 });
    }

    // Mint session.
    const userAgent = req.headers.get("user-agent");
    const session = await createAuthSession({
      address: verifyResult.address,
      origin,
      challengeId: verifyResult.challenge.id,
      userAgent,
    });

    // Queue 1 CRC auto-refund (fire-and-forget — failure here doesn't block auth).
    queueAuthRefund({
      address: verifyResult.address,
      txHash: matchedTx.txHash,
      challengeId: verifyResult.challenge.id,
    }).catch((err) => {
      console.error("[auth/verify-payment] refund queue error:", err);
    });

    const res = NextResponse.json({
      status: "confirmed",
      authenticated: true,
      address: verifyResult.address,
      expiresAt: session.expiresAt.toISOString(),
    });
    setAuthCookie(res, session.token, { expiresAt: session.expiresAt });
    return res;
  } catch (error: any) {
    console.error("[auth/verify-payment] error:", error?.message ?? error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

/**
 * Scan recent on-chain payments for a 1 CRC tx with `data: nf_auth_v2:<nonce>`
 * to the Safe. Returns the matching tx hash + sender address if found.
 */
async function scanForAuthPayment(nonce: string): Promise<{ txHash: string; sender: string } | null> {
  if (!SAFE_ADDRESS) return null;

  const newPayments = await checkAllNewPayments(1, SAFE_ADDRESS);
  const candidates = newPayments
    .filter((p) => p.gameData?.game === "nf_auth_v2" && p.gameData?.id === nonce)
    .map((p) => ({
      txHash: p.transactionHash.toLowerCase(),
      sender: p.sender.toLowerCase(),
      value: p.value,
    }));

  if (candidates.length === 0) return null;

  // Filter out already-claimed txs (paranoia — shouldn't happen since the
  // challenge.usedAt is the primary lock, but doubles as defense).
  const txHashes = candidates.map((c) => c.txHash);
  const claimed = await db
    .select({ txHash: claimedPayments.txHash })
    .from(claimedPayments)
    .where(inArray(claimedPayments.txHash, txHashes));
  const claimedSet = new Set(claimed.map((c) => c.txHash.toLowerCase()));

  for (const c of candidates) {
    if (claimedSet.has(c.txHash)) continue;
    // Validate amount (exact 1 CRC).
    try {
      const val = BigInt(c.value);
      if (val !== BigInt("1000000000000000000")) continue;
    } catch {
      continue;
    }
    return { txHash: c.txHash, sender: c.sender };
  }

  return null;
}

/**
 * Mark the payment as claimed and refund 1 CRC. Out-of-band from the
 * verify response so a refund failure doesn't block authentication.
 */
async function queueAuthRefund(params: {
  address: string;
  txHash: string;
  challengeId: number;
}): Promise<void> {
  await db
    .insert(claimedPayments)
    .values({
      txHash: params.txHash,
      gameType: "nf_auth_v2",
      gameId: params.challengeId,
      playerAddress: params.address,
      amountCrc: 1,
    })
    .onConflictDoNothing();

  const result = await executePayout({
    gameType: "nf_auth_v2_refund",
    gameId: `nf-auth-v2-refund-${params.txHash}`,
    recipientAddress: params.address,
    amountCrc: 1,
    reason: "NF Society — connexion securisee (rembourse)",
    payoutReason: "game_refund",
  });

  if (!result.success) {
    await db
      .update(authChallenges)
      .set({
        status: "refund_failed",
        errorMessage: result.error?.slice(0, 500) ?? "refund_failed",
        updatedAt: new Date(),
      })
      .where(and(eq(authChallenges.id, params.challengeId), eq(authChallenges.status, "confirmed")));
    return;
  }

  await db
    .update(authChallenges)
    .set({
      status: "refunded",
      refundTxHash: result.transferTxHash ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(authChallenges.id, params.challengeId), eq(authChallenges.status, "confirmed")));
}
