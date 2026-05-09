/**
 * Pure helpers for the Free-to-Play pivot.
 * This file has no server dependency, so client components can import it.
 *
 * XP is progression only. The arcade balance, stakes, payouts and daily wheel
 * non-CRC rewards are called Fragments.
 */

import {
  CRC_TO_FRAGMENTS_RATIO,
  crcToFragments,
} from "@/lib/fragments";

export const REAL_STAKES_FLAG_KEY = "real_stakes";
/** Force Fragments-only on chance games even when real_stakes=enabled. */
export const CHANCE_FRAGMENTS_ONLY_FLAG_KEY = "chance_games_fragments_only";

/**
 * Game keys classified as "chance" (gambling-shaped, vs skill 1v1 multi).
 * Mirrors `CHANCE_BALANCE_SUPPORTED` from `wallet-game-dispatch.ts` but lives
 * here so client components can import it without dragging the server bundle.
 * Keep the two lists in sync.
 */
export const CHANCE_GAME_KEYS: ReadonlySet<string> = new Set([
  "blackjack",
  "coin_flip",
  "coin-flip",
  "crash_dash",
  "crash-dash",
  "dice",
  "hilo",
  "keno",
  "lootbox",
  "lottery",
  "mines",
  "plinko",
  "roulette",
]);

export function isChanceGameKey(gameKey: string | null | undefined): boolean {
  if (!gameKey) return false;
  return CHANCE_GAME_KEYS.has(gameKey);
}

/**
 * Formats a CRC amount as either CRC or its Fragments equivalent.
 */
export function formatStake(
  crcAmount: number,
  opts: { realStakesEnabled: boolean; locale?: "fr" | "en"; decimals?: number }
): string {
  const { realStakesEnabled, locale = "fr", decimals = 0 } = opts;
  const bcp47 = locale === "fr" ? "fr-FR" : "en-US";

  if (realStakesEnabled) {
    const rounded = Math.round(crcAmount * 1000) / 1000;
    const str = Number.isInteger(rounded)
      ? rounded.toLocaleString(bcp47)
      : rounded.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    return `${str} CRC`;
  }

  const fragments = crcToFragments(crcAmount);
  const str = fragments.toLocaleString(bcp47, { maximumFractionDigits: decimals });
  return `${str} Fragments`;
}

/** Active stake unit label for table headers and charts. */
export function stakeUnit(realStakesEnabled: boolean): "CRC" | "Fragments" {
  return realStakesEnabled ? "CRC" : "Fragments";
}

/**
 * Converts CRC wording to Fragments wording for F2P screens.
 */
export function translateStakeText(text: string, realStakesEnabled: boolean): string {
  if (realStakesEnabled || !text) return text;

  let out = text.replace(/(\d+(?:[.,]\d+)?)\s*CRC\b/g, (_, n: string) => {
    const value = parseFloat(n.replace(",", "."));
    if (!Number.isFinite(value)) return `${n} Fragments`;
    return `${crcToFragments(value)} Fragments`;
  });

  out = out.replace(/\bCRC\b/g, "Fragments");
  return out;
}
