import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import { getBot } from "@/lib/telegram/bot";
import { registerHandlers } from "@/lib/telegram/handlers";

let initialized = false;
function initBot() {
  const bot = getBot();
  if (initialized) return bot;
  registerHandlers(bot);
  initialized = true;
  return bot;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const bot = initBot();
    const handler = webhookCallback(bot, "std/http");
    return handler(req);
  } catch (err) {
    console.error("[telegram-webhook] fatal error:", err);
    return NextResponse.json({ error: "webhook error" }, { status: 500 });
  }
}

// GET pour verification rapide en navigateur.
export async function GET() {
  return NextResponse.json({ ok: true, service: "telegram-webhook" });
}
