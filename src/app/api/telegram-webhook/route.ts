import { NextRequest, NextResponse } from "next/server";
import { webhookCallback } from "grammy";
import { bot } from "@/lib/telegram/bot";
import { registerHandlers } from "@/lib/telegram/handlers";

// Enregistre les handlers une seule fois par process (Vercel lambda).
let initialized = false;
function initBot() {
  if (initialized) return;
  registerHandlers(bot);
  initialized = true;
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    initBot();

    // grammy webhookCallback retourne un handler compatible std/http qui
    // s'occupe du parse du body et de la reponse.
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
