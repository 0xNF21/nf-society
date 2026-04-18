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
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
if (!token) {
  console.error("Missing TELEGRAM_BOT_TOKEN in env");
  process.exit(1);
}
if (!adminChatId) {
  console.error("Missing TELEGRAM_ADMIN_CHAT_ID in env");
  process.exit(1);
}

// Commandes user (EN par defaut, FR en locale override).
const COMMANDS_USER_DEFAULT = [
  { command: "start", description: "Start support" },
  { command: "menu", description: "Pick a category" },
];

const COMMANDS_USER_FR = [
  { command: "start", description: "Demarrer le support" },
  { command: "menu", description: "Choisir une categorie" },
];

// Commandes visibles UNIQUEMENT dans le groupe admin (ajoutent /clear).
const COMMANDS_ADMIN_DEFAULT = [
  ...COMMANDS_USER_DEFAULT,
  { command: "clear", description: "Delete all support messages + DB" },
];

const COMMANDS_ADMIN_FR = [
  ...COMMANDS_USER_FR,
  { command: "clear", description: "Supprimer tous les messages + DB" },
];

async function setCommands(commands, opts = {}) {
  const body = { commands };
  if (opts.languageCode) body.language_code = opts.languageCode;
  if (opts.scope) body.scope = opts.scope;

  const res = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`setMyCommands failed (${JSON.stringify(opts)}):`, data);
    process.exit(1);
  }
  console.log(`OK setMyCommands ${JSON.stringify(opts) || "default"}`);
}

// Scope global : applique a tous les chats sauf scopes plus specifiques.
await setCommands(COMMANDS_USER_DEFAULT);
await setCommands(COMMANDS_USER_FR, { languageCode: "fr" });

// Scope groupe admin : ajoute /clear visible uniquement dans ce chat.
const adminScope = { type: "chat", chat_id: Number(adminChatId) };
await setCommands(COMMANDS_ADMIN_DEFAULT, { scope: adminScope });
await setCommands(COMMANDS_ADMIN_FR, { scope: adminScope, languageCode: "fr" });

// Verifie
console.log("\nVerification global :");
for (const lang of [undefined, "fr"]) {
  const url = new URL(`https://api.telegram.org/bot${token}/getMyCommands`);
  if (lang) url.searchParams.set("language_code", lang);
  const data = await fetch(url).then((r) => r.json());
  console.log(`  lang=${lang || "default"} :`, JSON.stringify(data.result));
}
console.log("\nVerification admin group :");
for (const lang of [undefined, "fr"]) {
  const body = { scope: adminScope };
  if (lang) body.language_code = lang;
  const data = await fetch(`https://api.telegram.org/bot${token}/getMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => r.json());
  console.log(`  lang=${lang || "default"} :`, JSON.stringify(data.result));
}
