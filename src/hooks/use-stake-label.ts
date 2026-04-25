"use client";

import { useFeatureFlags } from "@/components/feature-flag-provider";
import { useLocale } from "@/components/language-provider";
import {
  formatStake,
  stakeUnit,
  crcToXp,
  translateStakeText,
  isChanceGameKey,
  REAL_STAKES_FLAG_KEY,
  CHANCE_XP_ONLY_FLAG_KEY,
} from "@/lib/stakes-utils";

/**
 * Hook cote client qui choisit dynamiquement l'unite d'affichage des montants
 * selon les flags `real_stakes` et `chance_games_xp_only`.
 *
 * Truth table (mirror du serveur dans src/lib/stakes.ts) :
 *   real_stakes=enabled  + chance_xp_only=enabled  → CRC partout
 *   real_stakes=enabled  + chance_xp_only=hidden   → CRC pour skill, XP pour chance
 *   real_stakes=hidden                              → XP partout
 *
 * @param gameKey — optionnel. Si fourni et que c'est un chance game, le hook
 * peut bascule en XP via le flag chance_xp_only meme quand real_stakes=enabled.
 *
 * Retourne un objet pratique avec :
 *   - `format(amount)` : "125 CRC" ou "1 250 XP"
 *   - `unit` : "CRC" | "XP"
 *   - `value(amount)` : le nombre a afficher (inchange en CRC, x10 en XP)
 *   - `realStakesEnabled` : boolean (true = CRC, false = XP)
 *   - `t(text)` : traduit un texte i18n contenant "CRC" → "XP" en F2P
 */
export function useStakeLabel(gameKey?: string | null) {
  const { flagStatus, loading } = useFeatureFlags();
  const { locale } = useLocale();

  // While flags load on the client, default to CRC mode (status quo) to avoid
  // a flash of XP labels on first render before the API answer comes back.
  let realStakesEnabled = true;
  if (!loading) {
    if (flagStatus(REAL_STAKES_FLAG_KEY) === "hidden") {
      realStakesEnabled = false;
    } else if (
      gameKey &&
      isChanceGameKey(gameKey) &&
      flagStatus(CHANCE_XP_ONLY_FLAG_KEY) === "hidden"
    ) {
      realStakesEnabled = false;
    }
  }

  return {
    realStakesEnabled,
    unit: stakeUnit(realStakesEnabled),
    format: (amount: number) => formatStake(amount, { realStakesEnabled, locale }),
    value: (amount: number) => (realStakesEnabled ? amount : crcToXp(amount)),
    /**
     * Transforme un texte i18n (ex: "Payer 5 CRC") pour le mode F2P :
     * "Payer 50 XP". En mode CRC, retourne le texte inchange.
     */
    t: (text: string | undefined | null) => translateStakeText(text ?? "", realStakesEnabled),
  };
}
