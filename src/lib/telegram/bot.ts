import { Bot } from "grammy";

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
