import { Bot } from "grammy";
import type { SupportType } from "./context";

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

// Retourne le message_thread_id du topic correspondant au type de ticket.
// Si l'env var n'est pas configuree, retourne undefined (message ira dans General).
// L'env var doit contenir un nombre (l'id du topic dans le supergroupe forum).
export function getTopicThreadId(type: SupportType | null | undefined): number | undefined {
  if (!type) type = "other";
  const envKey = {
    bug: "TELEGRAM_TOPIC_BUG",
    suggestion: "TELEGRAM_TOPIC_SUGGESTION",
    question: "TELEGRAM_TOPIC_QUESTION",
    other: "TELEGRAM_TOPIC_OTHER",
  }[type];
  const raw = process.env[envKey];
  if (!raw) return undefined;
  const n = Number(raw);
  if (Number.isNaN(n)) return undefined;
  return n;
}

// Map inverse : message_thread_id -> type. Sert a la commande /topics pour
// afficher un mapping lisible.
export function listConfiguredTopics(): Array<{ type: SupportType; threadId: number | undefined }> {
  return (["bug", "suggestion", "question", "other"] as SupportType[]).map((type) => ({
    type,
    threadId: getTopicThreadId(type),
  }));
}

// Chat + topic du forum public ou on annonce les parties multijoueur publiques.
// Different du groupe admin support (TELEGRAM_ADMIN_CHAT_ID) : ici c'est le
// groupe communautaire NF Society, avec un topic dedie "Lobby".
export function getLobbyChatId(): number | null {
  const raw = process.env.TELEGRAM_LOBBY_CHAT_ID;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

export function getLobbyThreadId(): number | undefined {
  const raw = process.env.TELEGRAM_LOBBY_TOPIC_ID;
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isNaN(n) ? undefined : n;
}
