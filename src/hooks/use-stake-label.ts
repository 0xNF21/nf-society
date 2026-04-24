"use client";

import { useFeatureFlags } from "@/components/feature-flag-provider";
import { useLocale } from "@/components/language-provider";
import { formatStake, stakeUnit, crcToXp, translateStakeText } from "@/lib/stakes-utils";

/**
 * Hook cote client qui choisit dynamiquement l'unite d'affichage des montants
 * selon le flag `real_stakes` :
 *   - flag enabled → "125 CRC"
 *   - flag hidden  → "1 250 XP"
 *
 * Retourne un objet pratique avec :
 *   - `format(amount)` : "125 CRC" ou "1 250 XP"
 *   - `unit` : "CRC" | "XP"
 *   - `value(amount)` : le nombre a afficher (inchange en CRC, x10 en XP)
 *   - `realStakesEnabled` : boolean
 */
export function useStakeLabel() {
  const { flagStatus, loading } = useFeatureFlags();
  const { locale } = useLocale();
  const realStakesEnabled = loading || flagStatus("real_stakes") !== "hidden";

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
