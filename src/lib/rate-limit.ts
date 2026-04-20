/**
 * Minimal in-memory sliding-window rate limiter.
 *
 * Meant for protecting expensive or write-heavy routes (cashout-init, etc.)
 * against accidental client spam or casual abuse. NOT a security boundary:
 *
 *  - The map is per-process. Vercel serverless spins up multiple instances,
 *    so an attacker distributing requests across them effectively multiplies
 *    the limit. Cold starts also wipe state.
 *  - IPs from x-forwarded-for are trivial to spoof if the attacker sits
 *    before our proxy. Treat this as best-effort friction, not auth.
 *
 * For real protection add a Redis/Upstash backend or a DB-backed counter.
 */

type Bucket = number[];
const buckets = new Map<string, Bucket>();

/** Periodic cleanup so the map doesn't grow unbounded. */
function sweep(now: number, windowMs: number) {
  for (const [key, entries] of buckets) {
    const alive = entries.filter((ts) => now - ts < windowMs);
    if (alive.length === 0) buckets.delete(key);
    else if (alive.length !== entries.length) buckets.set(key, alive);
  }
}

let lastSweep = 0;

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSec: number; limit: number };

/**
 * Record a hit for `key` and check whether it exceeds the allowed rate.
 *
 * - `max` hits per `windowMs` window.
 * - Returns { ok: true } and records the hit if under the limit.
 * - Returns { ok: false, retryAfterSec } without recording if at the limit,
 *   so the caller can surface a 429 with a hint.
 */
export function checkRateLimit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  // Sweep at most once per window to keep the map bounded.
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
