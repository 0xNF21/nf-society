import { Bot } from "grammy";

// Instance grammy singleton lazy. On n'instancie qu'a la premiere utilisation
// (runtime), sinon le build Vercel echoue pendant la collecte de page data car
// les env vars ne sont pas toujours disponibles a ce moment-la.

let _bot: Bot | null = null;
let _adminChatId: number | null = null;

export function getBot(): Bot {
  if (_bot) return _bot;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN missing in env");
  _bot = new Bot(token);
  return _bot;
}

export function getAdminChatId(): number {
  if (_adminChatId !== null) return _adminChatId;
  const raw = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!raw) throw new Error("TELEGRAM_ADMIN_CHAT_ID missing in env");
  const n = Number(raw);
  if (Number.isNaN(n)) throw new Error("TELEGRAM_ADMIN_CHAT_ID must be a number");
  _adminChatId = n;
  return _adminChatId;
}
