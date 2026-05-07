export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { eq, inArray, and, desc } from "drizzle-orm";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { authChallenges, authSessions, claimedPayments, payouts } from "@/lib/db/schema";
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
    const verifyToken = typeof body?.verifyToken === "string" ? body.verifyToken : "";
    const origin = body?.origin === "miniapp" ? "miniapp" : "standalone";

    if (!Number.isInteger(challengeId) || challengeId <= 0) {
      return NextResponse.json({ error: "invalid_challenge_id" }, { status: 400 });
    }

    // The verifyToken is required EVERYWHERE (pending, confirmed recovery,
    // etc.) so an attacker who only knows the public challenge ID + on-chain
    // tx can't claim the session. The token was returned at challenge
    // creation and only the originating browser holds it.
    if (!verifyToken || verifyToken.length < 32) {
      return NextResponse.json({ error: "missing_verify_token" }, { status: 400 });
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

    // Validate verifyToken hash against the stored hash. Done BEFORE any
    // session minting so a wrong token always returns the same shape of
    // response (constant-time considerations are not strictly relevant
    // since we compare hashes, not raw secrets).
    const { createHash: _ch } = await import("crypto");
    const providedHash = _ch("sha256").update(verifyToken).digest("hex");
    if (!challenge.verifyTokenHash || providedHash !== challenge.verifyTokenHash) {
      return NextResponse.json({ error: "verify_token_mismatch" }, { status: 401 });
    }

    if (challenge.usedAt && (challenge.status === "confirmed" || challenge.status === "refunded" || challenge.status === "refund_pending" || challenge.status === "refund_failed")) {
      // Idempotent recovery : si le client a perdu le cookie pendant la
      // premiere reponse confirmed (network error apres set-cookie), on
      // re-mint une nouvelle session pour la meme address + nouveau cookie.
      // SAFE car le verifyToken vient d'etre valide ci-dessus -> seul le
      // browser legitime peut atteindre ce branch.
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

    // Verify + atomically claim challenge. verifyToken is re-checked here
    // (defense in depth — the early check above protects the recovery branch).
    const verifyResult = await verifyPaymentChallenge({
      challengeId: challenge.id,
      txHash: matchedTx.txHash,
      senderAddress: matchedTx.sender,
      verifyToken,
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

    // Refund 1 CRC — durable + awaited so we don't lose it if the lambda
    // dies after the response is sent (Vercel doesn't guarantee unawaited
    // promises complete). Latency cost ~500ms-1s for tx broadcast (no
    // tx.wait — confirmation is a separate cron). Auth still succeeds even
    // if the refund fails — the challenge status flips to refund_failed
    // and the founder can manually retry via /api/payout/retry.
    try {
      await queueAuthRefund({
        address: verifyResult.address,
        txHash: matchedTx.txHash,
        challengeId: verifyResult.challenge.id,
      });
    } catch (err: any) {
      console.error("[auth/verify-payment] refund failed (auth still ok):", err?.message ?? err);
      // Mark the challenge so we know to retry. Don't fail the response.
      try {
        await db
          .update(authChallenges)
          .set({
            status: "refund_failed",
            errorMessage: String(err?.message ?? err).slice(0, 500),
            updatedAt: new Date(),
          })
          .where(and(eq(authChallenges.id, verifyResult.challenge.id), eq(authChallenges.status, "confirmed")));
      } catch { /* DB write failed too — server logs are the audit trail */ }
    }

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
 * Mark the payment as claimed, persist a durable retryable payout row, mark
 * the challenge intent, then broadcast the 1 CRC refund. Order matters for
 * serverless durability :
 *
 *   1. INSERT claimedPayments (idempotent via tx_hash UNIQUE)
 *   2. INSERT payouts row with status="pending" (durable + retryable via
 *      /api/payout/retry). Cle UNIQUE par gameId — re-run idempotent.
 *   3. UPDATE challenge.status = 'refund_pending' (link audit, le payouts
 *      row existe deja a ce moment-la).
 *   4. await executePayout — qui detecte le row existant (status=pending),
 *      le bumpe en attempts++ et broadcasts. Si le lambda meurt apres,
 *      le row reste en pending/sending et est retryable.
 *   5. Statut final du challenge depend du resultat ON-CHAIN, pas juste
 *      du broadcast :
 *        result.status === "success"           → challenge "refunded"
 *        result.status === "sending" + tx hash → challenge stays "refund_pending"
 *                                                avec refundTxHash set (cron
 *                                                verifiePending peut reconcilier)
 *        result failed                         → challenge "refund_failed"
 *
 *   Le statut "refunded" definitif est fonction de payouts.status='success'
 *   (mis a jour par verifyPendingPayout cron). Tant que ce n'est pas confirme
 *   on-chain, le challenge reste "refund_pending" avec le refundTxHash en
 *   transit.
 */
async function queueAuthRefund(params: {
  address: string;
  txHash: string;
  challengeId: number;
}): Promise<void> {
  const payoutGameId = `nf-auth-v2-refund-${params.txHash}`;

  // Phase 1 — claim payment (idempotent).
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

  // Phase 2 — pre-insert durable payout row BEFORE updating the challenge.
  // Garantit qu'un challenge `refund_pending` a TOUJOURS un payouts row
  // associe par gameId, donc retryable via /api/payout/retry meme si le
  // lambda crash entre ce point et le broadcast.
  await db
    .insert(payouts)
    .values({
      gameType: "nf_auth_v2_refund",
      gameId: payoutGameId,
      recipientAddress: params.address,
      amountCrc: 1,
      reason: "NF Society — connexion securisee (rembourse)",
      status: "pending",
    })
    .onConflictDoNothing();

  // Phase 3 — durable intent sur le challenge. Maintenant lie au payouts
  // row par gameId : audit trail complet.
  await db
    .update(authChallenges)
    .set({ status: "refund_pending", updatedAt: new Date() })
    .where(and(eq(authChallenges.id, params.challengeId), eq(authChallenges.status, "confirmed")));

  // Phase 4 — broadcast. executePayout detecte le payouts row existant
  // (status=pending), reset attempts a +1, broadcasts, update vers sending.
  const result = await executePayout({
    gameType: "nf_auth_v2_refund",
    gameId: payoutGameId,
    recipientAddress: params.address,
    amountCrc: 1,
    reason: "NF Society — connexion securisee (rembourse)",
    payoutReason: "game_refund",
  });

  // Phase 5 — reconcilier le statut du challenge avec le resultat reel.
  if (!result.success) {
    await db
      .update(authChallenges)
      .set({
        status: "refund_failed",
        errorMessage: result.error?.slice(0, 500) ?? "refund_failed",
        updatedAt: new Date(),
      })
      .where(and(eq(authChallenges.id, params.challengeId), eq(authChallenges.status, "refund_pending")));
    return;
  }

  // Broadcast OK. Si payouts.status est deja "success" (rare — cron
  // ultra-rapide), on flip a "refunded" definitif. Sinon (cas commun :
  // status="sending"), on reste "refund_pending" avec refundTxHash set —
  // le cron verifyPendingPayout reconcilira plus tard.
  if (result.status === "success") {
    await db
      .update(authChallenges)
      .set({
        status: "refunded",
        refundTxHash: result.transferTxHash ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(authChallenges.id, params.challengeId), eq(authChallenges.status, "refund_pending")));
  } else {
    // status "sending" — on garde refund_pending mais on memorise la tx hash
    // pour qu'un audit / cron puisse retrouver et confirmer plus tard.
    await db
      .update(authChallenges)
      .set({
        refundTxHash: result.transferTxHash ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(authChallenges.id, params.challengeId), eq(authChallenges.status, "refund_pending")));
  }
}
