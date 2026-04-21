import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { payouts } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { executePayout } from "@/lib/payout";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const limited = await enforceRateLimit(request, "payout", 10, 60000);
  if (limited) return limited;

  try {
    const body = await request.json();
    const { gameType, gameId, recipientAddress, amountCrc, reason, password } = body;

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!gameType || !gameId || !recipientAddress || !amountCrc) {
      return NextResponse.json(
        { error: "Missing required fields: gameType, gameId, recipientAddress, amountCrc" },
        { status: 400 },
      );
    }

    if (typeof amountCrc !== "number" || amountCrc <= 0) {
      return NextResponse.json({ error: "amountCrc must be a positive number" }, { status: 400 });
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress)) {
      return NextResponse.json({ error: "Invalid recipient address" }, { status: 400 });
    }

    const result = await executePayout({
      gameType,
      gameId,
      recipientAddress: recipientAddress.toLowerCase(),
      amountCrc,
      reason,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error: any) {
    console.error("Payout API error:", error.message);
    return NextResponse.json({ error: error.message || "Payout failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const limited = await enforceRateLimit(request, "payout", 10, 60000);
  if (limited) return limited;

  try {
    const authHeader = request.headers.get("authorization");
    const password = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const gameType = request.nextUrl.searchParams.get("gameType");
    const status = request.nextUrl.searchParams.get("status");
    const limit = parseInt(request.nextUrl.searchParams.get("limit") || "50", 10);

    let conditions: any[] = [];
    if (gameType) conditions.push(eq(payouts.gameType, gameType));
    if (status) conditions.push(eq(payouts.status, status));

    const query = conditions.length > 0
      ? db.select().from(payouts).where(and(...conditions)).orderBy(desc(payouts.createdAt)).limit(limit)
      : db.select().from(payouts).orderBy(desc(payouts.createdAt)).limit(limit);

    const results = await query;

    return NextResponse.json({
      payouts: results,
      total: results.length,
    });
  } catch (error: any) {
    console.error("Payout list error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
