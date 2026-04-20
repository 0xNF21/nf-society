import { Bot, Context, InlineKeyboard } from "grammy";
import { db } from "@/lib/db";
import { supportMessages } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getAdminChatId, getTopicThreadId, listConfiguredTopics } from "./bot";
import { decodeStartContext, formatAdminHeader, TelegramStartContext, SupportType } from "./context";

// Cache en memoire court pour le contexte `start` fourni par l'user au 1er message.
// Telegram n'expose pas le param start apres l'echange initial, donc on le stocke
// le temps que l'user envoie son premier "vrai" message.
// Cold-start proof car on persiste sur le 1er message en DB (context jsonb).
const pendingStartContext = new Map<number, { ctx: TelegramStartContext; at: number }>();

function buildMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("\uD83D\uDC1B Bug", "type:bug")
    .text("\uD83D\uDCA1 Suggestion", "type:suggestion")
    .row()
    .text("\u2753 Question", "type:question")
    .text("\uD83D\uDCAC Autre", "type:other");
}

const TYPE_PROMPTS: Record<SupportType, string> = {
  bug: "\uD83D\uDC1B Decris ton bug : ce qui s'est passe, ce que tu faisais, et la page si possible. Tu peux aussi envoyer une capture d'ecran.",
  suggestion: "\uD83D\uDCA1 Partage ton idee ou suggestion :",
  question: "\u2753 Pose ta question :",
  other: "\uD83D\uDCAC Explique ce qui t'amene :",
};

function setPendingType(userId: number, type: SupportType) {
  const existing = pendingStartContext.get(userId);
  pendingStartContext.set(userId, {
    ctx: { ...(existing?.ctx ?? {}), type },
    at: Date.now(),
  });
}

function gcPendingContext() {
  const now = Date.now();
  for (const [uid, entry] of pendingStartContext.entries()) {
    if (now - entry.at > 10 * 60 * 1000) pendingStartContext.delete(uid);
  }
}

export function registerHandlers(b: Bot) {
  const ADMIN_CHAT_ID = getAdminChatId();

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
      "Que veux-tu signaler ? Choisis une categorie, ou ecris directement ton message.\n\n" +
      "Welcome to NF Society support — pick a category below or just write your message.",
      { reply_markup: buildMenuKeyboard() }
    );
  });

  // /menu : re-affiche les boutons de categorie (pour changer de type plus tard).
  b.command("menu", async (ctx) => {
    if (ctx.chat.type !== "private") return;
    await ctx.reply("Choisis une categorie :", { reply_markup: buildMenuKeyboard() });
  });

  // Callback sur les boutons inline de type.
  b.callbackQuery(/^type:(bug|suggestion|question|other)$/, async (ctx) => {
    const type = ctx.match![1] as SupportType;
    const userId = ctx.from?.id;
    if (userId) {
      setPendingType(userId, type);
    }
    try {
      await ctx.editMessageText(TYPE_PROMPTS[type]);
    } catch {
      // si on ne peut pas editer (message trop vieux), on envoie un nouveau reply
      await ctx.reply(TYPE_PROMPTS[type]);
    }
    await ctx.answerCallbackQuery();
  });

  // /topics (admin only) — aide a recuperer les thread_id des topics pour
  // configurer les env vars. Si la commande est tapee DANS un topic, affiche
  // l'id de ce topic. Sinon, liste la config actuelle (env vars).
  b.command("topics", async (ctx) => {
    if (ctx.chat.id !== ADMIN_CHAT_ID) return;
    const currentThreadId = (ctx.message as any)?.message_thread_id as number | undefined;
    const lines: string[] = [];
    if (currentThreadId !== undefined) {
      lines.push(`\uD83D\uDCCD Topic courant: <code>${currentThreadId}</code>`);
      lines.push("");
    }
    lines.push("<b>Configuration actuelle :</b>");
    for (const { type, threadId } of listConfiguredTopics()) {
      const envKey = {
        bug: "TELEGRAM_TOPIC_BUG",
        suggestion: "TELEGRAM_TOPIC_SUGGESTION",
        question: "TELEGRAM_TOPIC_QUESTION",
        other: "TELEGRAM_TOPIC_OTHER",
      }[type];
      lines.push(
        threadId !== undefined
          ? `- ${envKey} = <code>${threadId}</code>`
          : `- ${envKey} = <i>(non configure)</i>`
      );
    }
    lines.push("");
    lines.push(
      "Pour recuperer l'id d'un topic, tape /topics <b>dans</b> ce topic."
    );
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  });

  // /clear (admin only) — supprime tous les messages du bot dans le groupe admin
  // et vide la table support_messages. Demande confirmation avant execution.
  b.command("clear", async (ctx) => {
    if (ctx.chat.id !== ADMIN_CHAT_ID) return;
    const keyboard = new InlineKeyboard()
      .text("\u2705 Oui, tout supprimer", "clear:confirm")
      .text("\u274C Annuler", "clear:cancel");
    await ctx.reply(
      "Supprimer TOUS les messages de support ?\n" +
      "- Messages du bot dans ce groupe (< 48h)\n" +
      "- Historique complet en DB (support_messages)",
      { reply_markup: keyboard }
    );
  });

  b.callbackQuery("clear:cancel", async (ctx) => {
    if (ctx.chat?.id !== ADMIN_CHAT_ID) {
      await ctx.answerCallbackQuery();
      return;
    }
    try {
      await ctx.editMessageText("Annule.");
    } catch {}
    await ctx.answerCallbackQuery();
  });

  b.callbackQuery("clear:confirm", async (ctx) => {
    if (ctx.chat?.id !== ADMIN_CHAT_ID) {
      await ctx.answerCallbackQuery();
      return;
    }
    await ctx.answerCallbackQuery({ text: "Suppression en cours..." });

    // Recupere tous les adminMessageId distincts pour les supprimer du groupe.
    const rows = await db
      .select({ id: supportMessages.adminMessageId })
      .from(supportMessages);
    const ids = Array.from(new Set(rows.map((r) => r.id).filter((id): id is number => !!id)));

    let deleted = 0;
    let errors = 0;

    // Batch jusqu'a 100 messages par appel deleteMessages.
    for (let i = 0; i < ids.length; i += 100) {
      const batch = ids.slice(i, i + 100);
      try {
        await ctx.api.deleteMessages(ADMIN_CHAT_ID, batch);
        deleted += batch.length;
      } catch {
        // fallback : one-by-one pour ce batch (certains trop vieux seront ignores)
        for (const id of batch) {
          try {
            await ctx.api.deleteMessage(ADMIN_CHAT_ID, id);
            deleted++;
          } catch {
            errors++;
          }
        }
      }
    }

    // Clear la DB
    let dbCleared = 0;
    try {
      const all = await db.select({ id: supportMessages.id }).from(supportMessages);
      dbCleared = all.length;
      await db.delete(supportMessages);
    } catch (err) {
      console.error("[telegram] db clear error:", err);
    }

    // Supprime le message de confirmation lui-meme
    try {
      await ctx.deleteMessage();
    } catch {}

    await ctx.api.sendMessage(
      ADMIN_CHAT_ID,
      `\u2705 Nettoyage termine\n` +
      `- Messages supprimes : ${deleted}\n` +
      `- Erreurs (trop vieux ou deja supprimes) : ${errors}\n` +
      `- Lignes DB supprimees : ${dbCleared}`
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

  const ADMIN_CHAT_ID = getAdminChatId();

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
    type: startCtx?.type,
  });

  const contentLabel = describeMessageContent(msg as any);

  // Route vers le topic correspondant au type (bug/suggestion/question/other).
  // undefined si le groupe n'est pas un forum ou si le type est absent → General topic.
  const threadId = getTopicThreadId(startCtx?.type);

  // Cas 1 : message texte pur — un seul message au groupe admin avec header + texte.
  if (msg.text && !hasMedia(msg as any)) {
    const adminText =
      `${header}\n` +
      `<i>uid:${from.id}</i>\n\n` +
      escapeHtml(msg.text);

    const sent = await ctx.api.sendMessage(ADMIN_CHAT_ID, adminText, {
      parse_mode: "HTML",
      ...(threadId !== undefined ? { message_thread_id: threadId } : {}),
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
      ...(threadId !== undefined ? { message_thread_id: threadId } : {}),
    });

    // copyMessage gere tous les types : photo/video/voice/sticker/document/etc.
    // Pas de bandeau "forwarded from" — le bot semble l'envoyer lui-meme.
    const copied = await ctx.api.copyMessage(ADMIN_CHAT_ID, ctx.chat!.id, msg.message_id, {
      ...(threadId !== undefined ? { message_thread_id: threadId } : {}),
    });

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
