import { NextRequest, NextResponse } from "next/server";
import { retryPayout } from "@/lib/payout";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { payoutId, password } = body;

    if (password !== process.env.ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!payoutId || typeof payoutId !== "number") {
      return NextResponse.json({ error: "Missing or invalid payoutId" }, { status: 400 });
    }

    const result = await retryPayout(payoutId);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error: any) {
    console.error("Payout retry error:", error.message);
    return NextResponse.json({ error: error.message || "Retry failed" }, { status: 500 });
  }
}
