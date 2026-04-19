#!/usr/bin/env node
// One-shot script pour enregistrer le webhook Telegram vers notre route API.
//
// Usage :
//   node scripts/telegram-set-webhook.mjs <public-url>
//
// Exemple :
//   node scripts/telegram-set-webhook.mjs https://nf-society.vercel.app
//
// Le script lit TELEGRAM_BOT_TOKEN depuis .env.local (dev) ou l'environnement.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envFile = path.join(ROOT, ".env.local");
  if (!fs.existsSync(envFile)) return;
  const content = fs.readFileSync(envFile, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvLocal();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in env");
  process.exit(1);
}

const publicUrl = process.argv[2];
if (!publicUrl) {
  console.error("Usage: node scripts/telegram-set-webhook.mjs <public-url>");
  console.error("Example: node scripts/telegram-set-webhook.mjs https://nf-society.vercel.app");
  process.exit(1);
}

const webhookUrl = `${publicUrl.replace(/\/$/, "")}/api/telegram-webhook`;

console.log(`Setting webhook to: ${webhookUrl}`);

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: webhookUrl,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  }),
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));

if (!data.ok) {
  process.exit(1);
}

// Verif
const info = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`).then((r) => r.json());
console.log("\nCurrent webhook info:");
console.log(JSON.stringify(info, null, 2));
