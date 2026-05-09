"use client";

import { useFeatureFlags } from "@/components/feature-flag-provider";
import { useLocale } from "@/components/language-provider";
import {
  formatStake,
  stakeUnit,
  translateStakeText,
  isChanceGameKey,
  REAL_STAKES_FLAG_KEY,
  CHANCE_FRAGMENTS_ONLY_FLAG_KEY,
} from "@/lib/stakes-utils";
import { crcToFragments } from "@/lib/fragments";

/**
 * Hook cote client qui choisit dynamiquement l'unite d'affichage des montants
 * selon les flags `real_stakes` et `chance_games_fragments_only`.
 *
 * Truth table (mirror du serveur dans src/lib/stakes.ts) :
 *   real_stakes=enabled  + chance_fragments_only=enabled  → CRC partout
 *   real_stakes=enabled  + chance_fragments_only=hidden   → CRC pour skill, Fragments pour chance
 *   real_stakes=hidden                                    → Fragments partout
 *
 * @param gameKey — optionnel. Si fourni et que c'est un chance game, le hook
 * peut bascule en Fragments via le flag chance_fragments_only meme quand real_stakes=enabled.
 *
 * Retourne un objet pratique avec :
 *   - `format(amount)` : "125 CRC" ou "1 250 Fragments"
 *   - `unit` : "CRC" | "Fragments"
 *   - `value(amount)` : le nombre a afficher (inchange en CRC, x10 en Fragments)
 *   - `realStakesEnabled` : boolean (true = CRC, false = Fragments)
 *   - `t(text)` : traduit un texte i18n contenant "CRC" → "Fragments" en F2P
 */
export function useStakeLabel(gameKey?: string | null) {
  const { flagStatus } = useFeatureFlags();
  const { locale } = useLocale();

  // Fail-closed: the provider returns "hidden" for legal flags while loading,
  // when /api/flags fails, or when the key is missing. CRC mode only appears
  // after real_stakes is explicitly enabled, with the chance-game override.
  const realStakesEnabled =
    flagStatus(REAL_STAKES_FLAG_KEY) === "enabled" &&
    !(
      gameKey &&
      isChanceGameKey(gameKey) &&
      flagStatus(CHANCE_FRAGMENTS_ONLY_FLAG_KEY) === "hidden"
    );

  return {
    realStakesEnabled,
    unit: stakeUnit(realStakesEnabled),
    format: (amount: number) => formatStake(amount, { realStakesEnabled, locale }),
    value: (amount: number) => (realStakesEnabled ? amount : crcToFragments(amount)),
    /**
     * Transforme un texte i18n (ex: "Payer 5 CRC") pour le mode F2P :
     * "Payer 50 Fragments". En mode CRC, retourne le texte inchange.
     */
    t: (text: string | undefined | null) => translateStakeText(text ?? "", realStakesEnabled),
  };
}
