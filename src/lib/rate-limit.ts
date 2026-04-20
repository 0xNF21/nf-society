/**
 * Sliding-window rate limiter.
 *
 * Backend strategy:
 *  1. If UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, use
 *     Upstash Redis. This is the real protection on Vercel serverless:
 *     the counter is shared across all instances and survives cold starts.
 *  2. Otherwise, fall back to an in-memory per-process map. Useful for
 *     local dev without Upstash; NOT a security boundary in production.
 *  3. If Upstash throws (network error, quota), we fall back to in-memory
 *     for the current call (fail open rather than blocking legitimate users
 *     during an outage). The failure is logged.
 *
 * IP identification via clientIp() is best-effort (x-forwarded-for can be
 * spoofed by anyone upstream of our proxy). Pair rate limits with real auth
 * or transaction proofs for anything that moves value.
 */
import { NextRequest, NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const UPSTASH_CONFIGURED = !!(
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
);

const redis = UPSTASH_CONFIGURED ? Redis.fromEnv() : null;

// Ratelimit instances are cheap but each has its own config, so we cache
// one per (max, windowMs) tuple to avoid re-instantiating on every request.
const limiterCache = new Map<string, Ratelimit>();
function getUpstashLimiter(max: number, windowMs: number): Ratelimit | null {
  if (!redis) return null;
  const cacheKey = `${max}:${windowMs}`;
  let limiter = limiterCache.get(cacheKey);
  if (!limiter) {
    const windowSec = Math.max(1, Math.floor(windowMs / 1000));
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(max, `${windowSec} s`),
      analytics: false,
      prefix: "nfs:rl",
    });
    limiterCache.set(cacheKey, limiter);
  }
  return limiter;
}

// ----- In-memory fallback (for dev or Upstash outages) -----
type Bucket = number[];
const buckets = new Map<string, Bucket>();
let lastSweep = 0;

function sweep(now: number, windowMs: number) {
  for (const [key, entries] of buckets) {
    const alive = entries.filter((ts) => now - ts < windowMs);
    if (alive.length === 0) buckets.delete(key);
    else if (alive.length !== entries.length) buckets.set(key, alive);
  }
}

function inMemoryCheck(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > windowMs) {
    sweep(now, windowMs);
    lastSweep = now;
  }
  const recent = (buckets.get(key) || []).filter((ts) => now - ts < windowMs);
  if (recent.length >= max) {
    const oldest = recent[0];
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return { ok: false, retryAfterSec, limit: max };
  }
  recent.push(now);
  buckets.set(key, recent);
  return { ok: true, remaining: max - recent.length };
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number; limit: number };

/**
 * Record a hit for `key` and check whether it exceeds the allowed rate.
 *
 * - `max` hits per `windowMs` window.
 * - Returns { ok: true } if under the limit, { ok: false } at or above.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const limiter = getUpstashLimiter(max, windowMs);
  if (limiter) {
    try {
      const res = await limiter.limit(key);
      if (res.success) {
        return { ok: true, remaining: res.remaining };
      }
      const retryAfterSec = Math.max(1, Math.ceil((res.reset - Date.now()) / 1000));
      return { ok: false, retryAfterSec, limit: max };
    } catch (err) {
      // Upstash unavailable: fall through to in-memory for this request.
      // Logged but not raised, so a transient outage doesn't 500 user requests.
      console.error("[rate-limit] Upstash error, falling back to in-memory:", err);
    }
  }
  return inMemoryCheck(key, max, windowMs);
}

/**
 * Extract a best-effort client identifier from a Next.js request.
 * Prefers the left-most IP in x-forwarded-for, falls back to x-real-ip,
 * then to the literal string "unknown" (so everyone shares one bucket).
 */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const xri = headers.get("x-real-ip");
  if (xri) return xri;
  return "unknown";
}

/**
 * One-liner helper for API routes: check the rate limit and return a
 * ready-made 429 response if blocked, or null if the caller can proceed.
 *
 * Usage inside a POST handler:
 *   const limited = await enforceRateLimit(req, "plinko-scan");
 *   if (limited) return limited;
 *
 * Default: 10 hits / 60s per IP. Bucket key is `<scope>:<ip>`.
 */
export async function enforceRateLimit(
  req: NextRequest,
  scope: string,
  max = 10,
  windowMs = 60_000,
): Promise<NextResponse | null> {
  const ip = clientIp(req.headers);
  const rl = await checkRateLimit(`${scope}:${ip}`, max, windowMs);
  if (rl.ok) return null;
  return NextResponse.json(
    { error: "rate_limited", retryAfterSec: rl.retryAfterSec, limit: rl.limit },
    { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
  );
}
