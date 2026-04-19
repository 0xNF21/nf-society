// Helpers purs pour encoder/decoder le contexte envoye via deep link Telegram.
// Le param `start` est limite a 64 caracteres en URL-safe base64.
// On garde un format compact : seulement page + wallet (optionnel).

export type SupportType = "bug" | "suggestion" | "question" | "other";

export type TelegramStartContext = {
  page?: string;           // URL relative de la page d'ou vient l'user
  wallet?: string;         // adresse wallet (0x...)
  type?: SupportType;      // categorie choisie via le menu inline
};

// Libelle/emoji du type pour le header admin.
export function supportTypeLabel(type: SupportType | null | undefined): string {
  if (type === "bug") return "\uD83D\uDC1B <b>BUG</b>";            // 🐛
  if (type === "suggestion") return "\uD83D\uDCA1 <b>SUGGESTION</b>"; // 💡
  if (type === "question") return "\u2753 <b>QUESTION</b>";        // ❓
  if (type === "other") return "\uD83D\uDCAC <b>AUTRE</b>";        // 💬
  return "";
}

// base64url (URL-safe) encoding/decoding.
function toBase64Url(input: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(input, "utf-8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  // Fallback navigateur
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(input: string): string {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf-8");
  }
  return atob(padded);
}

export function encodeStartContext(ctx: TelegramStartContext): string {
  // JSON minifie pour rester court. Limite Telegram : 64 chars.
  const json = JSON.stringify(ctx);
  return toBase64Url(json);
}

export function decodeStartContext(encoded: string): TelegramStartContext | null {
  try {
    const json = fromBase64Url(encoded);
    const parsed = JSON.parse(json);
    if (typeof parsed === "object" && parsed !== null) {
      return parsed as TelegramStartContext;
    }
    return null;
  } catch {
    return null;
  }
}

// Construit l'URL publique Telegram a ouvrir depuis le bouton support.
export function buildTelegramSupportUrl(botUsername: string, ctx?: TelegramStartContext): string {
  const base = `https://t.me/${botUsername}`;
  if (!ctx || (!ctx.page && !ctx.wallet)) return base;
  const encoded = encodeStartContext(ctx);
  return `${base}?start=${encoded}`;
}

// Formate le header place en tete des messages forwardes au groupe admin.
// Utilise HTML parse_mode pour un rendu propre.
export function formatAdminHeader(opts: {
  firstName?: string | null;
  username?: string | null;
  userId: number;
  walletAddress?: string | null;
  page?: string | null;
  type?: SupportType | null;
}): string {
  const parts: string[] = [];
  const displayName = opts.firstName || "Anonyme";
  const handle = opts.username ? `@${escapeHtml(opts.username)}` : `<code>${opts.userId}</code>`;
  parts.push(`<b>${escapeHtml(displayName)}</b> ${handle}`);
  if (opts.walletAddress) {
    parts.push(`wallet: <code>${escapeHtml(shortWallet(opts.walletAddress))}</code>`);
  }
  if (opts.page) {
    parts.push(`page: <code>${escapeHtml(opts.page)}</code>`);
  }
  const mainLine = parts.join(" | ");
  const prefix = supportTypeLabel(opts.type);
  return prefix ? `${prefix}\n${mainLine}` : mainLine;
}

function shortWallet(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
