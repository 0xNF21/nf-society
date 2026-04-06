import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

// Public: returns all flags with status (no auth needed)
export async function GET() {
  try {
    const flags = await db.select().from(featureFlags);
    const map: Record<string, string> = {};
    for (const f of flags) map[f.key] = f.status;
    return NextResponse.json({ flags: map });
  } catch (error) {
    console.error("[Flags] Error:", error);
    return NextResponse.json({ flags: {} });
  }
}
