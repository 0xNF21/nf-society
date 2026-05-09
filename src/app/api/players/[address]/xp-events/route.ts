import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAuthenticatedAddress } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { xpEvents } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { address: string } },
) {
  const limited = await enforceRateLimit(req, "players-xp-events", 30, 60000);
  if (limited) return limited;

  const address = params.address.toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }

  const authenticatedAddress = await getAuthenticatedAddress(req).catch(() => null);
  if (authenticatedAddress?.toLowerCase() !== address) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(Math.floor(limitParam), 100))
    : 50;

  const events = await db
    .select({
      id: xpEvents.id,
      action: xpEvents.action,
      amountXp: xpEvents.amountXp,
      sourceType: xpEvents.sourceType,
      sourceId: xpEvents.sourceId,
      xpAfter: xpEvents.xpAfter,
      fragmentsBalanceAfter: xpEvents.fragmentsBalanceAfter,
      levelAfter: xpEvents.levelAfter,
      metadata: xpEvents.metadata,
      createdAt: xpEvents.createdAt,
    })
    .from(xpEvents)
    .where(eq(xpEvents.address, address))
    .orderBy(desc(xpEvents.createdAt), desc(xpEvents.id))
    .limit(limit);

  return NextResponse.json({
    events: events.map((event) => ({
      ...event,
      createdAt: event.createdAt.toISOString(),
    })),
  });
}
