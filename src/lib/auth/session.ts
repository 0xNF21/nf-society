/**
 * Auth session primitives — server-side trust for wallet identity.
 *
 * Two challenge methods supported :
 *
 *   1. miniapp_sign_message : the front asks the Circles host to sign a
 *      nonce via passkey. The server verifies the signature against the
 *      wallet (EIP-1271 for Safes, EIP-191 fallback for EOAs).
 *
 *   2. payment_1crc : the user pays 1 CRC to the Safe with `data: nf_auth:<nonce>`.
 *      The server scans the chain, validates sender + amount + data, then
 *      refunds the 1 CRC.
 *
 * Both methods produce the same output : a session row + an HttpOnly cookie.
 *
 * Sliding window :
 *   - expiresAt = NOW() + 30 days, refreshed on activity
 *   - hardExpiresAt = createdAt + 90 days, never moves
 *   - refresh DB write throttled to once per hour to avoid write amplification
 *
 * Cookie : `nfs_auth` with `SameSite=None; Secure` (works in iframe + standalone
 * since prod is HTTPS-only).
 */

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { createHash, randomBytes } from "crypto";
import { createPublicClient, http, hashMessage as viemHashMessage } from "viem";
import { gnosis } from "viem/chains";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { authChallenges, authSessions } from "@/lib/db/schema";
import type { AuthChallengeRow, AuthSessionRow } from "@/lib/db/schema";

// ─────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────

export const AUTH_COOKIE_NAME = "nfs_auth";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days sliding
export const SESSION_HARD_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 days max
export const SESSION_REFRESH_THROTTLE_MS = 60 * 60 * 1000; // 1 hour

export const CHALLENGE_TTL_SIGN_MS = 5 * 60 * 1000; // 5 min for signing
export const CHALLENGE_TTL_PAYMENT_MS = 30 * 60 * 1000; // 30 min for payment

const NF_DOMAIN = "nf-society.vercel.app";
const ERC1271_MAGIC_VALUE = "0x1626ba7e";

const GNOSIS_RPC = "https://rpc.gnosischain.com";

export type AuthMethod = "miniapp_sign_message" | "payment_1crc";
export type AuthOrigin = "miniapp" | "standalone" | "unknown";

// ─────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────

/** Generate a 32-byte cryptographically random secret as a hex string. */
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 hash of a token, used for DB lookup without storing the secret. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** SHA-256 hash of a UA string, anonymized fingerprint for audit. */
function hashUserAgent(ua: string | null): string | null {
  if (!ua) return null;
  return createHash("sha256").update(ua).digest("hex").slice(0, 32);
}

/** Random URL-safe nonce, used as challenge identifier in messages/data. */
function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

// ─────────────────────────────────────────────────────────────────────────
// Challenge creation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Build the human-readable message a user must sign for `miniapp_sign_message`.
 * Includes the domain, nonce, and expiry to prevent replay across apps.
 */
function buildSignInMessage(nonce: string, expiresAt: Date, expectedAddress?: string): string {
  const lines = [
    `Sign in to NF Society`,
    ``,
    `Domain: ${NF_DOMAIN}`,
    `Nonce: ${nonce}`,
    `Expires: ${expiresAt.toISOString()}`,
  ];
  if (expectedAddress) {
    lines.push(`Address: ${expectedAddress.toLowerCase()}`);
  }
  return lines.join("\n");
}

/**
 * Build the payment data tag for `payment_1crc`. Embedded in the on-chain
 * tx so the scan can match the tx to a specific challenge.
 */
function buildPaymentData(nonce: string): string {
  return `nf_auth:${nonce}`;
}

export type CreateChallengeOpts = {
  method: AuthMethod;
  origin?: AuthOrigin;
  expectedAddress?: string;
};

export type CreatedChallenge = {
  id: number;
  method: AuthMethod;
  nonce: string;
  message: string;
  expiresAt: Date;
  /**
   * Secret returned ONLY for `payment_1crc`. Required as a request parameter
   * on `verify-payment` to claim the session. Never broadcast on-chain — the
   * front holds it in memory until verification succeeds (or the challenge
   * expires).
   *
   * Without this, an attacker watching the chain for `nf_auth:<nonce>` txs
   * could iterate sequential challenge IDs and steal the session of the
   * legitimate payer.
   */
  verifyToken?: string;
};

/**
 * Create a new auth challenge. Returns the public payload the front needs :
 * the message to sign (sign_message) or the data tag to embed in the payment.
 */
export async function createAuthChallenge(opts: CreateChallengeOpts): Promise<CreatedChallenge> {
  const nonce = generateNonce();
  const ttl = opts.method === "payment_1crc" ? CHALLENGE_TTL_PAYMENT_MS : CHALLENGE_TTL_SIGN_MS;
  const expiresAt = new Date(Date.now() + ttl);

  const message =
    opts.method === "miniapp_sign_message"
      ? buildSignInMessage(nonce, expiresAt, opts.expectedAddress)
      : buildPaymentData(nonce);

  // Generate a verify token only for payment_1crc — sign_message proofs are
  // already self-authenticating (the signature ties the requester to the wallet).
  const verifyToken = opts.method === "payment_1crc" ? generateToken() : undefined;
  const verifyTokenHash = verifyToken ? hashToken(verifyToken) : null;

  const [row] = await db
    .insert(authChallenges)
    .values({
      method: opts.method,
      nonce,
      message,
      expectedAddress: opts.expectedAddress?.toLowerCase() ?? null,
      origin: opts.origin ?? null,
      expiresAt,
      status: "pending",
      verifyTokenHash,
    })
    .returning({ id: authChallenges.id });

  return {
    id: row.id,
    method: opts.method,
    nonce,
    message,
    expiresAt,
    verifyToken,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Signature verification (Mini App)
// ─────────────────────────────────────────────────────────────────────────

const ERC1271_ABI = [
  "function isValidSignature(bytes32 hash, bytes signature) view returns (bytes4)",
];

// Viem public client — supports EIP-191 + ERC-1271 + ERC-6492 in a single
// `verifyMessage` call (handles Safe/smart contract wallets correctly).
const viemClient = createPublicClient({
  chain: gnosis,
  transport: http(GNOSIS_RPC),
});

/**
 * Verify a signature for a given message + address. Three layers tried in
 * order :
 *
 *   1. viem `verifyMessage` — handles EIP-191 + ERC-1271 + ERC-6492 with
 *      proper SafeMessage hashing for Safes. This is the canonical path
 *      for Circles wallets (which are Gnosis Safes).
 *
 *   2. Manual EIP-191 ecrecover (ethers) — defense-in-depth fallback for
 *      the EOA case if viem chokes on a malformed signature.
 *
 *   3. Manual ERC-1271 with raw EIP-191 hash — last resort for hosts that
 *      return a signature already adapted to `isValidSignature(bytes32,bytes)`.
 *
 * Returns `true` only if at least one path validates. Logs the failed
 * paths for debugging without leaking the signature material.
 */
async function verifySignature(
  address: string,
  message: string,
  signature: string,
): Promise<boolean> {
  const lower = address.toLowerCase();
  const sig = signature.startsWith("0x") ? (signature as `0x${string}`) : (`0x${signature}` as `0x${string}`);
  const addr = lower as `0x${string}`;

  // Layer 1 — viem verifyMessage (canonical for Safes).
  try {
    const valid = await viemClient.verifyMessage({
      address: addr,
      message,
      signature: sig,
    });
    if (valid) return true;
  } catch (err) {
    console.warn("[auth] viem verifyMessage threw, trying fallbacks:", err);
  }

  // Layer 2 — ethers EOA ecrecover.
  try {
    const recovered = ethers.verifyMessage(message, signature);
    if (recovered.toLowerCase() === lower) return true;
  } catch {
    // continue
  }

  // Layer 3 — manual ERC-1271 with EIP-191 hash.
  try {
    const provider = new ethers.JsonRpcProvider(GNOSIS_RPC);
    const contract = new ethers.Contract(address, ERC1271_ABI, provider);
    const messageHash = viemHashMessage(message);
    const result = await contract.isValidSignature(messageHash, sig);
    if (result === ERC1271_MAGIC_VALUE) return true;
  } catch (err) {
    console.warn("[auth] manual ERC-1271 threw:", err);
  }

  return false;
}

export type VerifySignatureResult =
  | { ok: true; challenge: AuthChallengeRow; address: string }
  | { ok: false; error: string };

/**
 * Verify a sign_message proof and consume the challenge atomically.
 * Returns the validated address on success.
 */
export async function verifyMiniAppSignature(params: {
  challengeId: number;
  signature: string;
  expectedAddress: string;
}): Promise<VerifySignatureResult> {
  const expected = params.expectedAddress.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(expected)) {
    return { ok: false, error: "invalid_address" };
  }
  if (typeof params.signature !== "string" || params.signature.length < 4) {
    return { ok: false, error: "invalid_signature" };
  }

  const [challenge] = await db
    .select()
    .from(authChallenges)
    .where(eq(authChallenges.id, params.challengeId))
    .limit(1);

  if (!challenge) return { ok: false, error: "challenge_not_found" };
  if (challenge.method !== "miniapp_sign_message") return { ok: false, error: "wrong_method" };
  if (challenge.usedAt) return { ok: false, error: "challenge_already_used" };
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, error: "challenge_expired" };
  if (challenge.status !== "pending") return { ok: false, error: "challenge_not_pending" };
  if (challenge.expectedAddress && challenge.expectedAddress !== expected) {
    return { ok: false, error: "address_mismatch" };
  }

  const valid = await verifySignature(expected, challenge.message, params.signature);
  if (!valid) {
    await db
      .update(authChallenges)
      .set({ status: "rejected", errorMessage: "signature_invalid", updatedAt: new Date() })
      .where(eq(authChallenges.id, challenge.id));
    return { ok: false, error: "signature_invalid" };
  }

  // Atomic claim — guards against double-use even under concurrent verifies.
  const claimed = await db
    .update(authChallenges)
    .set({
      status: "confirmed",
      signature: params.signature,
      usedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(authChallenges.id, challenge.id), sql`${authChallenges.usedAt} IS NULL`))
    .returning();

  if (claimed.length === 0) return { ok: false, error: "challenge_already_used" };

  return { ok: true, challenge: claimed[0], address: expected };
}

// ─────────────────────────────────────────────────────────────────────────
// Payment verification (Standalone)
// ─────────────────────────────────────────────────────────────────────────

export type VerifyPaymentResult =
  | { ok: true; challenge: AuthChallengeRow; address: string }
  | { ok: false; error: string };

/**
 * Verify a 1-CRC payment proof. The caller must already have :
 *
 *   1. Detected the on-chain tx and matched it to the challenge nonce.
 *   2. Captured the verifyToken from the originating browser request body.
 *
 * This helper :
 *   - Validates the verifyToken against the stored hash (anti-replay).
 *   - Atomically marks the challenge as confirmed.
 *   - Returns the sender for session creation.
 *
 * The verifyToken check is what prevents an attacker who watches the chain
 * for `nf_auth:<nonce>` payments from claiming the session : they have the
 * public nonce + tx hash but not the secret token returned to the original
 * browser at challenge creation.
 */
export async function verifyPaymentChallenge(params: {
  challengeId: number;
  txHash: string;
  senderAddress: string;
  verifyToken: string;
}): Promise<VerifyPaymentResult> {
  const sender = params.senderAddress.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(sender)) {
    return { ok: false, error: "invalid_address" };
  }
  if (!/^0x[a-f0-9]{64}$/.test(params.txHash.toLowerCase())) {
    return { ok: false, error: "invalid_tx_hash" };
  }
  if (typeof params.verifyToken !== "string" || params.verifyToken.length < 32) {
    return { ok: false, error: "invalid_verify_token" };
  }

  const [challenge] = await db
    .select()
    .from(authChallenges)
    .where(eq(authChallenges.id, params.challengeId))
    .limit(1);

  if (!challenge) return { ok: false, error: "challenge_not_found" };
  if (challenge.method !== "payment_1crc") return { ok: false, error: "wrong_method" };
  if (challenge.usedAt) return { ok: false, error: "challenge_already_used" };
  if (challenge.expiresAt.getTime() < Date.now()) return { ok: false, error: "challenge_expired" };
  if (challenge.status !== "pending") return { ok: false, error: "challenge_not_pending" };
  if (challenge.expectedAddress && challenge.expectedAddress !== sender) {
    return { ok: false, error: "address_mismatch" };
  }

  // Verify token check — the attacker who only watched the chain doesn't
  // have this secret, so they can't claim the session even with a known
  // challenge ID + tx hash.
  if (!challenge.verifyTokenHash) {
    // Pre-PR challenge without a token : reject (legacy challenges should
    // never reach this code path since old challenges are 30 min TTL).
    return { ok: false, error: "verify_token_missing_in_challenge" };
  }
  const providedHash = hashToken(params.verifyToken);
  if (providedHash !== challenge.verifyTokenHash) {
    return { ok: false, error: "verify_token_mismatch" };
  }

  const claimed = await db
    .update(authChallenges)
    .set({
      status: "confirmed",
      txHash: params.txHash.toLowerCase(),
      usedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(authChallenges.id, challenge.id), sql`${authChallenges.usedAt} IS NULL`))
    .returning();

  if (claimed.length === 0) return { ok: false, error: "challenge_already_used" };

  return { ok: true, challenge: claimed[0], address: sender };
}

// ─────────────────────────────────────────────────────────────────────────
// Session creation + lookup
// ─────────────────────────────────────────────────────────────────────────

export type CreatedSession = {
  /** Secret token to set in the cookie — never stored in DB. */
  token: string;
  /** Session row id for audit. */
  sessionId: number;
  /** Expiration timestamp for the cookie max-age. */
  expiresAt: Date;
  hardExpiresAt: Date;
};

/**
 * Mint a new session for an authenticated address. Returns the secret token
 * (set as cookie) and the lifetime metadata. The caller writes the cookie.
 */
export async function createAuthSession(params: {
  address: string;
  origin: AuthOrigin;
  challengeId?: number;
  userAgent?: string | null;
}): Promise<CreatedSession> {
  const lower = params.address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(lower)) {
    throw new Error("createAuthSession: invalid address");
  }

  const token = generateToken();
  const tokenHash = hashToken(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const hardExpiresAt = new Date(now.getTime() + SESSION_HARD_TTL_MS);

  const [row] = await db
    .insert(authSessions)
    .values({
      tokenHash,
      address: lower,
      origin: params.origin,
      lastAuthChallengeId: params.challengeId ?? null,
      userAgentHash: hashUserAgent(params.userAgent ?? null),
      expiresAt,
      hardExpiresAt,
      lastActiveAt: now,
      lastRefreshedAt: now,
    })
    .returning({ id: authSessions.id });

  return {
    token,
    sessionId: row.id,
    expiresAt,
    hardExpiresAt,
  };
}

/**
 * Read the session token from the request cookie and return the matching
 * row if it's still alive. Returns null if missing/expired/revoked.
 *
 * Side-effect : refreshes `expiresAt` and `lastActiveAt` if the row was
 * last refreshed > 1 hour ago, capped by `hardExpiresAt`.
 */
export async function getAuthSession(req: NextRequest): Promise<AuthSessionRow | null> {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const now = new Date();

  const [session] = await db
    .select()
    .from(authSessions)
    .where(eq(authSessions.tokenHash, tokenHash))
    .limit(1);

  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < now.getTime()) return null;
  if (session.hardExpiresAt.getTime() < now.getTime()) return null;

  // Lazy refresh — write at most once per hour per session.
  const sinceRefresh = now.getTime() - session.lastRefreshedAt.getTime();
  if (sinceRefresh > SESSION_REFRESH_THROTTLE_MS) {
    const newExpiresAt = new Date(
      Math.min(now.getTime() + SESSION_TTL_MS, session.hardExpiresAt.getTime()),
    );
    await db
      .update(authSessions)
      .set({
        expiresAt: newExpiresAt,
        lastActiveAt: now,
        lastRefreshedAt: now,
      })
      .where(eq(authSessions.id, session.id));
    return { ...session, expiresAt: newExpiresAt, lastActiveAt: now, lastRefreshedAt: now };
  }

  return session;
}

/**
 * Public helper for routes — returns the trusted address or `null`.
 * Use this instead of trusting `body.address`.
 */
export async function getAuthenticatedAddress(req: NextRequest): Promise<string | null> {
  const session = await getAuthSession(req);
  return session?.address ?? null;
}

/**
 * Convenience helper that returns either the trusted address OR a 401
 * NextResponse to short-circuit the route. Pattern :
 *
 *   const addressOr401 = await requireAuthenticatedAddress(req);
 *   if (addressOr401 instanceof NextResponse) return addressOr401;
 *   const address = addressOr401;
 */
export async function requireAuthenticatedAddress(
  req: NextRequest,
): Promise<string | NextResponse> {
  const address = await getAuthenticatedAddress(req);
  if (!address) {
    return NextResponse.json(
      { error: "AUTH_REQUIRED", message: "This action requires an authenticated session." },
      { status: 401 },
    );
  }
  return address;
}

/**
 * Revoke the current session (logout). Idempotent.
 */
export async function revokeCurrentSession(req: NextRequest): Promise<void> {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return;
  const tokenHash = hashToken(token);
  await db
    .update(authSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(authSessions.tokenHash, tokenHash), sql`${authSessions.revokedAt} IS NULL`));
}

// ─────────────────────────────────────────────────────────────────────────
// Cookie helpers
// ─────────────────────────────────────────────────────────────────────────

/**
 * Set the auth cookie on a response. SameSite=None+Secure is required to
 * support both standalone and Mini App iframe contexts.
 *
 * In dev (non-HTTPS) we drop Secure so the cookie still sticks ; the
 * Mini App scenario doesn't apply locally.
 */
export function setAuthCookie(
  res: NextResponse,
  token: string,
  opts: { expiresAt: Date },
): void {
  const isProd = process.env.NODE_ENV === "production";
  const maxAgeSec = Math.max(1, Math.floor((opts.expiresAt.getTime() - Date.now()) / 1000));

  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProd,
    sameSite: "none",
    path: "/",
    maxAge: maxAgeSec,
  });
}

export function clearAuthCookie(res: NextResponse): void {
  const isProd = process.env.NODE_ENV === "production";
  res.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    httpOnly: true,
    secure: isProd,
    sameSite: "none",
    path: "/",
    maxAge: 0,
  });
}
