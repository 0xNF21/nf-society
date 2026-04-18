#!/usr/bin/env node
// Enregistre les commandes bot visibles dans le menu "/" de Telegram.
// A relancer chaque fois que les commandes changent.
//
// Usage :
//   node scripts/telegram-set-commands.mjs
//
// Telegram detecte la langue UI du client et affiche la description correspondante.
// Les NOMS des commandes (/start, /menu) sont globaux : impossible de les renommer
// par langue (contrainte API Telegram). Seules les descriptions sont localisees.

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

// Default (EN) = langue de fallback.
const COMMANDS_DEFAULT = [
  { command: "start", description: "Start support" },
  { command: "menu", description: "Pick a category" },
];

const COMMANDS_FR = [
  { command: "start", description: "Demarrer le support" },
  { command: "menu", description: "Choisir une categorie" },
];

async function setCommands(commands, languageCode) {
  const body = { commands };
  if (languageCode) body.language_code = languageCode;

  const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`setMyCommands failed (lang=${languageCode || "default"}):`, data);
    process.exit(1);
  }
  console.log(`OK setMyCommands (lang=${languageCode || "default"})`);
}

// Enregistre default (EN) puis FR.
await setCommands(COMMANDS_DEFAULT);
await setCommands(COMMANDS_FR, "fr");

// Verifie
console.log("\nVerification :");
for (const lang of [undefined, "fr", "en"]) {
  const url = new URL(`https://api.telegram.org/bot${token}/getMyCommands`);
  if (lang) url.searchParams.set("language_code", lang);
  const data = await fetch(url).then((r) => r.json());
  console.log(`  lang=${lang || "default"} :`, JSON.stringify(data.result));
}
