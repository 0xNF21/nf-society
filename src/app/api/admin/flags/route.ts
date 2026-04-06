import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const VALID_STATUSES = ["enabled", "coming_soon", "hidden"];

function checkAuth(req: NextRequest) {
  const auth = req.headers.get("x-admin-password");
  return auth === ADMIN_PASSWORD;
}

// GET — list all flags (admin, with full details)
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const flags = await db.select().from(featureFlags);
  return NextResponse.json({ flags });
}

// PATCH — change a flag's status
export async function PATCH(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { key, status } = await req.json();
    if (!key || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "key and status (enabled|coming_soon|hidden) required" },
        { status: 400 }
      );
    }
    const [updated] = await db
      .update(featureFlags)
      .set({ status, updatedAt: new Date() })
      .where(eq(featureFlags.key, key))
      .returning();
    if (!updated) {
      return NextResponse.json({ error: "Flag not found" }, { status: 404 });
    }
    return NextResponse.json({ flag: updated });
  } catch (error) {
    console.error("[Admin Flags] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
