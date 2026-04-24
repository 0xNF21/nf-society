/**
 * Helpers purs pour le pivot Free-to-Play.
 * Ce fichier ne contient aucune dependance serveur (pas de DB, pas de `pg`),
 * donc il peut etre importe librement depuis les composants client.
 *
 * Pour les helpers serveur (isRealStakesEnabled, assertRealStakesEnabled),
 * voir `src/lib/stakes.ts`.
 */

export const REAL_STAKES_FLAG_KEY = "real_stakes";

/** 1 CRC = 10 XP en mode F2P. Conversion appliquee pour les mises et les gains. */
export const CRC_TO_XP_RATIO = 10;

/** Convertit un montant CRC vers son equivalent XP en mode F2P. */
export function crcToXp(crc: number): number {
  return Math.round(crc * CRC_TO_XP_RATIO);
}

/** Convertit un montant XP vers son equivalent CRC. */
export function xpToCrc(xp: number): number {
  return xp / CRC_TO_XP_RATIO;
}

/**
 * Formate un montant en texte "X CRC" ou "X XP" selon le mode actif.
 * Utile pour tous les labels de lobby, paiement, stats, PnL card, etc.
 *
 * @example
 *   formatStake(125, { realStakesEnabled: true })  → "125 CRC"
 *   formatStake(125, { realStakesEnabled: false }) → "1 250 XP"
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

  const xp = crcToXp(crcAmount);
  const str = xp.toLocaleString(bcp47, { maximumFractionDigits: decimals });
  return `${str} XP`;
}

/** Label court de l'unite active ("CRC" ou "XP"), pour headers de colonnes et graphiques. */
export function stakeUnit(realStakesEnabled: boolean): "CRC" | "XP" {
  return realStakesEnabled ? "CRC" : "XP";
}

/**
 * Transforme un texte pour le mode F2P :
 *   - Remplace "CRC" par "XP"
 *   - Multiplie les nombres qui precedent "CRC" par le ratio (x10)
 *
 * @example
 *   translateStakeText("Payer 5 CRC", false) → "Payer 50 XP"
 *   translateStakeText("gagnez 1.5 CRC", false) → "gagnez 15 XP"
 *   translateStakeText("gagnez des CRC", false) → "gagnez des XP"
 *   translateStakeText("Payer 5 CRC", true) → "Payer 5 CRC"  (inchange en mode CRC)
 */
export function translateStakeText(text: string, realStakesEnabled: boolean): string {
  if (realStakesEnabled || !text) return text;
  // 1) "(\d[.,]?\d*) CRC" → "(\d*10) XP"
  let out = text.replace(/(\d+(?:[.,]\d+)?)\s*CRC\b/g, (_, n: string) => {
    const value = parseFloat(n.replace(",", "."));
    if (!Number.isFinite(value)) return `${n} XP`;
    const xp = Math.round(value * CRC_TO_XP_RATIO);
    return `${xp} XP`;
  });
  // 2) Remaining "CRC" (no leading number) → "XP"
  out = out.replace(/\bCRC\b/g, "XP");
  return out;
}
