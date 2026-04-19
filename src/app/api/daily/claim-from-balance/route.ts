export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { dailySessions, players } from "@/lib/db/schema";
import { eq, and, isNull, desc, isNotNull } from "drizzle-orm";
import { generateDailyToken, todayString } from "@/lib/daily";

/**
 * POST /api/daily/claim-from-balance  { address }
 *
 * Balance-mode equivalent of the on-chain daily flow. The on-chain version
 * charges 1 CRC and immediately refunds 1 CRC (net 0 — the 1 CRC was only
 * used to prove the sender's wallet). A user with any prepaid balance has
 * already proven their wallet at topup time, so we skip the CRC dance
 * entirely and just confirm today's session for this address.
 *
 * Required:
 *   - body.address: the connected player (Mini App walletAddress or
 *     standalone saved profile). Must have a players row with
 *     balance_crc > 0 — this is our rough identity check. The standalone
 *     footgun (saved profile != actual wallet) is the same as elsewhere
 *     and will be tightened in Phase 3d via payment-proof.
 *
 * Side effects: sets dailySessions.address, awards daily_checkin XP.
 * No CRC movement (balance unchanged, no ledger row).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const addressRaw = body?.address ? String(body.address) : "";
    const addr = addressRaw.trim().toLowerCase();
    if (!addr || !/^0x[a-f0-9]{40}$/.test(addr)) {
      return NextResponse.json({ error: "invalid_address" }, { status: 400 });
    }

    // Require balance > 0 as a minimum identity proof (user topped up = they
    // controlled the wallet that did the on-chain topup).
    const [player] = await db
      .select({ balance: players.balanceCrc })
      .from(players)
      .where(eq(players.address, addr))
      .limit(1);
    if (!player || player.balance <= 0) {
      return NextResponse.json({ error: "no_balance" }, { status: 403 });
    }

    const date = todayString();

    // Already claimed today?
    const [already] = await db
      .select()
      .from(dailySessions)
      .where(and(eq(dailySessions.date, date), eq(dailySessions.address, addr)))
      .limit(1);
    if (already) {
      return NextResponse.json({
        ok: true,
        token: already.token,
        alreadyClaimed: true,
        session: {
          id: already.id,
          scratchPlayed: already.scratchPlayed,
          scratchResult: already.scratchResult,
          spinPlayed: already.spinPlayed,
          spinResult: already.spinResult,
        },
      });
    }

    // Reuse a pending (unconfirmed) session from today, or create one.
    const [pending] = await db
      .select()
      .from(dailySessions)
      .where(and(eq(dailySessions.date, date), isNull(dailySessions.address)))
      .orderBy(desc(dailySessions.id))
      .limit(1);

    let sessionId: number;
    let token: string;
    if (pending) {
      // Atomically claim it for this address only if still unconfirmed.
      const updated = await db
        .update(dailySessions)
        .set({ address: addr, txHash: `balance:${pending.id}` })
        .where(and(eq(dailySessions.id, pending.id), isNull(dailySessions.address)))
        .returning({ id: dailySessions.id, token: dailySessions.token });
      if (updated.length === 0) {
        // Someone else grabbed it between SELECT and UPDATE — bail and retry
        // on the next user click (this path is extremely rare).
        return NextResponse.json({ error: "race_try_again" }, { status: 409 });
      }
      sessionId = updated[0].id;
      token = updated[0].token;
    } else {
      token = generateDailyToken();
      const [inserted] = await db
        .insert(dailySessions)
        .values({ token, date, address: addr })
        .returning({ id: dailySessions.id });
      sessionId = inserted.id;
      // Fill txHash now that we have the id (synthetic, no CRC).
      await db
        .update(dailySessions)
        .set({ txHash: `balance:${sessionId}` })
        .where(eq(dailySessions.id, sessionId));
    }

    // Award XP — non-blocking
    try {
      const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      await fetch(`${base}/api/players/xp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: addr, action: "daily_checkin" }),
      });
    } catch { /* XP failure silent */ }

    return NextResponse.json({
      ok: true,
      token,
      alreadyClaimed: false,
      session: { id: sessionId },
    });
  } catch (error: any) {
    console.error("[Daily] claim-from-balance error:", error?.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
