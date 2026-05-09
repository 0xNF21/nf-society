import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { hasAdminPassword, isAdminPasswordValid } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "admin-login", 10, 60000);
  if (limited) return limited;

  try {
    const { password } = await req.json();

    if (!hasAdminPassword()) {
      return NextResponse.json(
        { error: "Admin password not configured" },
        { status: 500 }
      );
    }

    if (!isAdminPasswordValid(password)) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  }
}
