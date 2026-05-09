import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error: "ENDPOINT_REMOVED",
      message: "Public XP attribution is disabled. XP is awarded server-side by game routes.",
    },
    { status: 410 },
  );
}
