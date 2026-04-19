import { Bot, Context } from "grammy";
import { db } from "@/lib/db";
import { supportMessages } from "@/lib/db/schema";
import { eq, desc, and } from "drizzle-orm";
import { getAdminChatId } from "./bot";
import { decodeStartContext, formatAdminHeader, TelegramStartContext } from "./context";

// Cache en memoire court pour le contexte `start` fourni par l'user au 1er message.
// Telegram n'expose pas le param start apres l'echange initial, donc on le stocke
// le temps que l'user envoie son premier "vrai" message.
// Cold-start proof car on persiste sur le 1er message en DB (context jsonb).
const pendingStartContext = new Map<number, { ctx: TelegramStartContext; at: number }>();

// Nettoyage des entrees > 10 min.
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
      "Decris ton probleme ou ta question en un message. " +
      "Un admin te repondra ici des que possible.\n\n" +
      "Welcome to NF Society support — describe your issue and an admin will reply here."
    );
  });

  // Message texte d'un user en prive => forward au groupe admin.
  b.on("message:text", async (ctx) => {
    try {
      // Groupe admin : on traite comme reponse si c'est un reply, sinon on ignore.
      if (ctx.chat.id === getAdminChatId()) {
        await handleAdminReply(ctx);
        return;
      }
      // Doit etre un chat prive avec un user.
      if (ctx.chat.type !== "private") return;

      await handleUserMessage(ctx);
    } catch (err) {
      console.error("[telegram] message handler error:", err);
    }
  });
}

async function handleUserMessage(ctx: Context) {
  const from = ctx.from;
  const msg = ctx.message;
  if (!from || !msg?.text) return;

  // Recupere contexte du /start si c'est le premier vrai message.
  const pending = pendingStartContext.get(from.id);
  const startCtx = pending?.ctx;
  if (pending) pendingStartContext.delete(from.id);

  // Header admin : nom, handle, wallet (si fourni), page d'origine.
  const header = formatAdminHeader({
    firstName: from.first_name,
    username: from.username,
    userId: from.id,
    walletAddress: startCtx?.wallet,
    page: startCtx?.page,
  });

  // Forward vers le groupe admin avec le user id encode dans le header
  // (pour le retrouver lors d'une reply admin).
  // On utilise un footer invisible <code>uid:123</code> en derniere ligne.
  const adminText =
    `${header}\n` +
    `<i>uid:${from.id}</i>\n\n` +
    escapeHtml(msg.text);

  const sent = await ctx.api.sendMessage(getAdminChatId(), adminText, {
    parse_mode: "HTML",
  });

  // Log en DB
  try {
    await db.insert(supportMessages).values({
      telegramUserId: from.id,
      telegramUsername: from.username ?? null,
      telegramFirstName: from.first_name ?? null,
      direction: "in",
      text: msg.text,
      adminMessageId: sent.message_id,
      userMessageId: msg.message_id,
      context: startCtx ? startCtx : null,
      walletAddress: startCtx?.wallet ?? null,
    });
  } catch (err) {
    console.error("[telegram] db insert in error:", err);
  }

  // Accuse de reception cote user (uniquement au 1er message de la session).
  if (startCtx) {
    await ctx.reply("Message envoye au support. On te repond au plus vite.");
  }
}

async function handleAdminReply(ctx: Context) {
  const msg = ctx.message;
  const from = ctx.from;
  if (!msg?.text || !from) return;

  // Admin doit repondre EN REPLY a un message du bot pour qu'on sache a quel user envoyer.
  const replyTo = msg.reply_to_message;
  if (!replyTo) {
    // Message libre dans le groupe admin, on ignore (c'est une discussion interne).
    return;
  }

  // Tente de retrouver l'user via le adminMessageId.
  const originalMsgId = replyTo.message_id;
  const original = await db
    .select()
    .from(supportMessages)
    .where(
      and(
        eq(supportMessages.adminMessageId, originalMsgId),
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
      "Impossible de retrouver l'user cible. Reponds en reply au message du bot qui contient 'uid:...'."
    );
    return;
  }

  // Envoie au user
  let sentMsgId: number | undefined;
  try {
    const sent = await ctx.api.sendMessage(targetUserId, msg.text);
    sentMsgId = sent.message_id;
  } catch (err) {
    console.error("[telegram] send to user failed:", err);
    await ctx.reply(
      `Echec de l'envoi au user ${targetUserId}. Il a peut-etre bloque le bot.`
    );
    return;
  }

  // Log en DB
  try {
    await db.insert(supportMessages).values({
      telegramUserId: targetUserId,
      telegramUsername: null,
      telegramFirstName: null,
      direction: "out",
      text: msg.text,
      adminMessageId: msg.message_id,
      userMessageId: sentMsgId ?? null,
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
