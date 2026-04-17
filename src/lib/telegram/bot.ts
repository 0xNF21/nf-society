import { Bot } from "grammy";

// Instance grammy singleton reutilisable.
// Les handlers sont enregistres au moment du webhook (registerHandlers).

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminChatRaw = process.env.TELEGRAM_ADMIN_CHAT_ID;

if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN missing in env");
}
if (!adminChatRaw) {
  throw new Error("TELEGRAM_ADMIN_CHAT_ID missing in env");
}

export const bot = new Bot(token);
export const ADMIN_CHAT_ID = Number(adminChatRaw);

if (Number.isNaN(ADMIN_CHAT_ID)) {
  throw new Error("TELEGRAM_ADMIN_CHAT_ID must be a number");
}
