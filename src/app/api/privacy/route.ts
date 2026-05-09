export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { privacySettings } from "@/lib/db/schema";
import { getAuthenticatedAddress } from "@/lib/auth/session";
import { eq } from "drizzle-orm";

const DEFAULT_SETTINGS = {
  hidePnl: false,
  hideTotalBet: false,
  hideFragmentsSpent: false,
  hideGameHistory: false,
  hideFromLeaderboard: false,
  hideFromSearch: false,
};

const ALLOWED_KEYS = Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[];

export async function GET(req: NextRequest) {
  try {
    const address = await getAuthenticatedAddress(req);
    if (!address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [row] = await db
      .select()
      .from(privacySettings)
      .where(eq(privacySettings.address, address))
      .limit(1);

    const settings = row
      ? {
          hidePnl: row.hidePnl,
          hideTotalBet: row.hideTotalBet,
          hideFragmentsSpent: row.hideFragmentsSpent,
          hideGameHistory: row.hideGameHistory,
          hideFromLeaderboard: row.hideFromLeaderboard,
          hideFromSearch: row.hideFromSearch,
        }
      : DEFAULT_SETTINGS;

    return NextResponse.json({ address, settings });
  } catch (error: any) {
    console.error("[Privacy GET]", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const updates: Record<string, unknown> = body?.settings ?? {};

    const address = await getAuthenticatedAddress(req);
    if (!address) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sanitized: Record<string, boolean> = {};
    for (const key of ALLOWED_KEYS) {
      if (typeof updates[key] === "boolean") {
        sanitized[key] = updates[key] as boolean;
      }
    }

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json({ error: "No valid fields" }, { status: 400 });
    }

    await db
      .insert(privacySettings)
      .values({ address, ...DEFAULT_SETTINGS, ...sanitized, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: privacySettings.address,
        set: { ...sanitized, updatedAt: new Date() },
      });

    const [row] = await db
      .select()
      .from(privacySettings)
      .where(eq(privacySettings.address, address))
      .limit(1);

    return NextResponse.json({
      address,
      settings: {
        hidePnl: row!.hidePnl,
        hideTotalBet: row!.hideTotalBet,
        hideFragmentsSpent: row!.hideFragmentsSpent,
        hideGameHistory: row!.hideGameHistory,
        hideFromLeaderboard: row!.hideFromLeaderboard,
        hideFromSearch: row!.hideFromSearch,
      },
    });
  } catch (error: any) {
    console.error("[Privacy PATCH]", error.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
