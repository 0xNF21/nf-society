/**
 * Annonces Telegram des parties multijoueur publiques.
 *
 * Quand une partie publique est creee, on poste un message dans le topic "Lobby"
 * du groupe communautaire NF Society. Quand la 2e joueur paye, on edite le
 * message pour marquer "joueur trouve, partie demarree".
 *
 * Toutes les fonctions sont no-op si TELEGRAM_LOBBY_CHAT_ID n'est pas configure,
 * et ne throw jamais : on ne veut pas faire echouer la creation d'une partie
 * si Telegram est down.
 */

import { db } from "@/lib/db";
import { multiplayerAnnouncements } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { getBot, getLobbyChatId, getLobbyThreadId } from "./bot";

type GameMeta = { label: string; emoji: string };

// Duplique volontairement GAME_LABELS/GAME_ICONS de game-registry.ts pour
// eviter un import cote server-only qui tirerait le registre entier.
const GAME_META: Record<string, GameMeta> = {
  morpion: { label: "Morpion", emoji: "❌⭕" },
  memory: { label: "Memory", emoji: "🃏" },
  relics: { label: "Relics", emoji: "⚓" },
  dames: { label: "Dames", emoji: "♟️" },
  pfc: { label: "Pierre-Feuille-Ciseaux", emoji: "✊📄✂️" },
  "crc-races": { label: "Courses CRC", emoji: "🏇" },
};

function getGameMeta(gameKey: string): GameMeta {
  return GAME_META[gameKey] ?? { label: gameKey, emoji: "🎮" };
}

function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://nf-society.vercel.app").replace(/\/$/, "");
}

function shortAddress(addr: string | null | undefined): string {
  if (!addr) return "anonyme";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildNewGameText(
  gameKey: string,
  slug: string,
  betCrc: number,
  creatorAddress: string | null
): string {
  const meta = getGameMeta(gameKey);
  const url = `${getAppUrl()}/${gameKey}/${slug}`;
  return (
    `${meta.emoji} <b>${escapeHtml(meta.label)}</b> — ${betCrc} CRC\n` +
    `👤 Creee par <code>${escapeHtml(shortAddress(creatorAddress))}</code>\n` +
    `\n` +
    `→ <a href="${url}">Rejoindre la partie</a>`
  );
}

function buildStartedText(
  gameKey: string,
  slug: string,
  betCrc: number,
  creatorAddress: string | null
): string {
  const meta = getGameMeta(gameKey);
  const url = `${getAppUrl()}/${gameKey}/${slug}`;
  return (
    `${meta.emoji} <s>${escapeHtml(meta.label)} — ${betCrc} CRC</s>\n` +
    `✅ <b>Joueur trouve, partie demarree</b>\n` +
    `<i>Creee par ${escapeHtml(shortAddress(creatorAddress))}</i>\n` +
    `\n` +
    `<a href="${url}">Voir la partie</a>`
  );
}

/**
 * Poste l'annonce dans le topic Lobby. No-op si pas configure.
 * Log puis swallow les erreurs — on ne veut pas faire crasher la creation
 * de partie a cause d'un incident Telegram.
 */
export async function announceNewLobbyGame(params: {
  gameKey: string;
  slug: string;
  betCrc: number;
  creatorAddress: string | null;
  isPrivate: boolean;
}): Promise<void> {
  if (params.isPrivate) return;

  const chatId = getLobbyChatId();
  if (chatId === null) return;
  const threadId = getLobbyThreadId();

  try {
    const text = buildNewGameText(
      params.gameKey,
      params.slug,
      params.betCrc,
      params.creatorAddress
    );

    const sent = await getBot().api.sendMessage(chatId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(threadId !== undefined ? { message_thread_id: threadId } : {}),
    });

    await db.insert(multiplayerAnnouncements).values({
      gameKey: params.gameKey,
      slug: params.slug,
      telegramChatId: chatId,
      telegramMessageId: sent.message_id,
    }).onConflictDoNothing();
  } catch (err) {
    console.error("[telegram] announceNewLobbyGame failed:", err);
  }
}

/**
 * Edite l'annonce quand la partie demarre (2e joueur paye).
 * No-op si pas d'annonce enregistree (ex: partie privee ou TG pas configure).
 */
export async function markLobbyGameStarted(params: {
  gameKey: string;
  slug: string;
  betCrc: number;
  creatorAddress: string | null;
}): Promise<void> {
  const chatId = getLobbyChatId();
  if (chatId === null) return;

  try {
    const [row] = await db
      .select()
      .from(multiplayerAnnouncements)
      .where(
        and(
          eq(multiplayerAnnouncements.gameKey, params.gameKey),
          eq(multiplayerAnnouncements.slug, params.slug)
        )
      )
      .limit(1);

    if (!row || row.startedAt) return; // pas d'annonce, ou deja marquee

    const text = buildStartedText(
      params.gameKey,
      params.slug,
      params.betCrc,
      params.creatorAddress
    );

    await getBot().api.editMessageText(row.telegramChatId, row.telegramMessageId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });

    await db
      .update(multiplayerAnnouncements)
      .set({ startedAt: new Date() })
      .where(eq(multiplayerAnnouncements.id, row.id));
  } catch (err) {
    console.error("[telegram] markLobbyGameStarted failed:", err);
  }
}
