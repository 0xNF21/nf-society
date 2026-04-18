import { Bot, Context } from "grammy";
import { db } from "@/lib/db";
import { supportMessages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { ADMIN_CHAT_ID } from "./bot";
import { decodeStartContext, formatAdminHeader, TelegramStartContext } from "./context";

// Cache en memoire court pour le contexte `start` fourni par l'user au 1er message.
// Telegram n'expose pas le param start apres l'echange initial, donc on le stocke
// le temps que l'user envoie son premier "vrai" message.
// Cold-start proof car on persiste sur le 1er message en DB (context jsonb).
const pendingStartContext = new Map<number, { ctx: TelegramStartContext; at: number }>();

function gcPendingContext() {
  const now = Date.now();
  for (const [uid, entry] of pendingStartContext.entries()) {
    if (now - entry.at > 10 * 60 * 1000) pendingStartContext.delete(uid);
  }
}

export function registerHandlers(b: Bot) {
  // /start [payload] — l'user arrive via le deep link du bouton Support.
  b.command("start", async (ctx) => {
    const payload = ctx.match?.trim();
    const userId = ctx.from?.id;

    if (payload && userId) {
      const decoded = decodeStartContext(payload);
      if (decoded) {
        pendingStartContext.set(userId, { ctx: decoded, at: Date.now() });
      }
    }
    gcPendingContext();

    await ctx.reply(
      "Bienvenue sur le support NF Society\n\n" +
      "Decris ton probleme ou ta question (texte, photo, video, voice...). " +
      "Un admin te repondra ici des que possible.\n\n" +
      "Welcome to NF Society support — describe your issue (text, photo, video, voice...) and an admin will reply here."
    );
  });

  // Catch-all pour tous types de messages (texte, photo, video, voice, document, sticker...).
  b.on("message", async (ctx) => {
    try {
      if (ctx.chat.id === ADMIN_CHAT_ID) {
        await handleAdminReply(ctx);
        return;
      }
      if (ctx.chat.type !== "private") return;
      await handleUserMessage(ctx);
    } catch (err) {
      console.error("[telegram] message handler error:", err);
    }
  });
}

// Determine un libelle lisible du type de message pour les logs / previews.
function describeMessageContent(msg: any): string {
  if (msg.text) return msg.text;
  if (msg.caption) return msg.caption;
  if (msg.photo) return "[photo]";
  if (msg.video) return "[video]";
  if (msg.voice) return "[voice]";
  if (msg.audio) return "[audio]";
  if (msg.video_note) return "[video_note]";
  if (msg.sticker) return "[sticker]";
  if (msg.animation) return "[gif]";
  if (msg.document) return "[document]";
  if (msg.location) return "[location]";
  if (msg.contact) return "[contact]";
  return "[media]";
}

function hasMedia(msg: any): boolean {
  return !!(
    msg.photo ||
    msg.video ||
    msg.voice ||
    msg.audio ||
    msg.video_note ||
    msg.sticker ||
    msg.animation ||
    msg.document ||
    msg.location ||
    msg.contact
  );
}

async function handleUserMessage(ctx: Context) {
  const from = ctx.from;
  const msg = ctx.message;
  if (!from || !msg) return;

  // Recupere contexte du /start si c'est le premier vrai message.
  const pending = pendingStartContext.get(from.id);
  const startCtx = pending?.ctx;
  if (pending) pendingStartContext.delete(from.id);

  const header = formatAdminHeader({
    firstName: from.first_name,
    username: from.username,
    userId: from.id,
    walletAddress: startCtx?.wallet,
    page: startCtx?.page,
  });

  const contentLabel = describeMessageContent(msg as any);

  // Cas 1 : message texte pur — un seul message au groupe admin avec header + texte.
  if (msg.text && !hasMedia(msg as any)) {
    const adminText =
      `${header}\n` +
      `<i>uid:${from.id}</i>\n\n` +
      escapeHtml(msg.text);

    const sent = await ctx.api.sendMessage(ADMIN_CHAT_ID, adminText, {
      parse_mode: "HTML",
    });

    await insertIn(from, msg, startCtx, sent.message_id, msg.text);
  } else {
    // Cas 2 : message avec media (photo, video, voice, sticker, document, etc.).
    // On envoie d'abord un header texte (pour contenir le uid + contexte),
    // puis on COPIE le message original dans le groupe admin.
    const headerText =
      `${header}\n` +
      `<i>uid:${from.id}</i>\n` +
      `<i>${escapeHtml(contentLabel)}</i>`;

    const headerMsg = await ctx.api.sendMessage(ADMIN_CHAT_ID, headerText, {
      parse_mode: "HTML",
    });

    // copyMessage gere tous les types : photo/video/voice/sticker/document/etc.
    // Pas de bandeau "forwarded from" — le bot semble l'envoyer lui-meme.
    const copied = await ctx.api.copyMessage(ADMIN_CHAT_ID, ctx.chat!.id, msg.message_id);

    // Log 2 entrees : header + copie. Comme ca l'admin peut reply a n'importe laquelle.
    await insertIn(from, msg, startCtx, headerMsg.message_id, contentLabel);
    await insertIn(from, msg, null, copied.message_id, contentLabel);
  }

  // Accuse de reception au 1er message de la session (celui qui a un startCtx).
  if (startCtx) {
    await ctx.reply("Message envoye au support. On te repond au plus vite.");
  }
}

async function insertIn(
  from: { id: number; username?: string; first_name?: string },
  msg: { message_id: number },
  startCtx: TelegramStartContext | null | undefined,
  adminMessageId: number,
  textOrLabel: string
) {
  try {
    await db.insert(supportMessages).values({
      telegramUserId: from.id,
      telegramUsername: from.username ?? null,
      telegramFirstName: from.first_name ?? null,
      direction: "in",
      text: textOrLabel,
      adminMessageId,
      userMessageId: msg.message_id,
      context: startCtx ? startCtx : null,
      walletAddress: startCtx?.wallet ?? null,
    });
  } catch (err) {
    console.error("[telegram] db insert in error:", err);
  }
}

async function handleAdminReply(ctx: Context) {
  const msg = ctx.message;
  const from = ctx.from;
  if (!msg || !from) return;

  // Admin doit repondre EN REPLY a un message du bot pour qu'on sache a quel user envoyer.
  const replyTo = msg.reply_to_message;
  if (!replyTo) return;

  // Retrouve le user cible via le adminMessageId (match soit le header soit la copie media).
  const original = await db
    .select()
    .from(supportMessages)
    .where(
      and(
        eq(supportMessages.adminMessageId, replyTo.message_id),
        eq(supportMessages.direction, "in")
      )
    )
    .limit(1);

  let targetUserId: number | null = null;
  if (original[0]) {
    targetUserId = Number(original[0].telegramUserId);
  } else {
    // Fallback : parser le uid dans le texte du message parent.
    const match = replyTo.text?.match(/uid:(\d+)/);
    if (match) targetUserId = Number(match[1]);
  }

  if (!targetUserId) {
    await ctx.reply(
      "Impossible de retrouver l'user cible. Reponds en reply au message du bot (header ou media) qui contient 'uid:...'."
    );
    return;
  }

  // Envoie au user — copyMessage gere TOUS les types (texte, photo, video, voice, etc.).
  // Si c'est un message texte pur, copyMessage fait pareil que sendMessage.
  let sentMsgId: number | null = null;
  try {
    const copied = await ctx.api.copyMessage(targetUserId, ctx.chat!.id, msg.message_id);
    sentMsgId = copied.message_id;
  } catch (err) {
    console.error("[telegram] send to user failed:", err);
    await ctx.reply(
      `Echec de l'envoi au user ${targetUserId}. Il a peut-etre bloque le bot.`
    );
    return;
  }

  // Log en DB
  try {
    const label = describeMessageContent(msg as any);
    await db.insert(supportMessages).values({
      telegramUserId: targetUserId,
      telegramUsername: null,
      telegramFirstName: null,
      direction: "out",
      text: label,
      adminMessageId: msg.message_id,
      userMessageId: sentMsgId,
      context: null,
      walletAddress: null,
    });
  } catch (err) {
    console.error("[telegram] db insert out error:", err);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
