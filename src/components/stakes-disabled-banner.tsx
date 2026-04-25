"use client";

import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useFeatureFlags } from "@/components/feature-flag-provider";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { REAL_STAKES_FLAG_KEY, CHANCE_XP_ONLY_FLAG_KEY } from "@/lib/stakes-utils";

const DISMISS_KEY = "nf-stakes-banner-dismissed";

/**
 * Sticky top banner that surfaces the F2P state to players.
 * Renders in two cases:
 *
 *   1. real_stakes=hidden                                    → "F2P partout"
 *   2. real_stakes=enabled + chance_games_xp_only=hidden     → "Chance en XP, skill en CRC"
 *
 * Otherwise no banner is rendered. Dismissable via localStorage; the dismiss
 * key is shared between the two cases so a player who clicks "X" once won't
 * see the banner again until localStorage is cleared.
 */
export default function StakesDisabledBanner() {
  const { flagStatus, loading } = useFeatureFlags();
  const { locale } = useLocale();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });

  if (loading) return null;
  if (dismissed) return null;

  const realStakesHidden = flagStatus(REAL_STAKES_FLAG_KEY) === "hidden";
  const chanceOnlyHidden = flagStatus(CHANCE_XP_ONLY_FLAG_KEY) === "hidden";

  // Pick which mode to display. F2P-total takes precedence when both are on.
  let mode: "f2p-all" | "chance-xp-only" | null = null;
  if (realStakesHidden) mode = "f2p-all";
  else if (chanceOnlyHidden) mode = "chance-xp-only";
  if (!mode) return null;

  const t = translations.stakesBanner;
  const title = mode === "f2p-all" ? t.title[locale] : t.chanceOnlyTitle[locale];
  const message = mode === "f2p-all" ? t.message[locale] : t.chanceOnlyMessage[locale];

  const handleDismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <div className="sticky top-0 z-40 bg-marine text-white px-4 py-2.5 flex items-center justify-center gap-3 text-sm shadow-md">
      <Sparkles className="h-4 w-4 shrink-0" />
      <div className="flex flex-col sm:flex-row sm:items-center gap-x-3 gap-y-0.5">
        <span className="font-semibold">{title}</span>
        <span className="opacity-90">{message}</span>
      </div>
      {mode === "f2p-all" && (
        <Link
          href="/dashboard"
          className="hidden sm:inline-flex px-2.5 py-0.5 bg-white/15 hover:bg-white/25 rounded-lg transition-colors text-xs font-bold"
        >
          {t.cashoutCta[locale]}
        </Link>
      )}
      <button
        onClick={handleDismiss}
        aria-label={t.dismiss[locale]}
        className="p-1 hover:bg-white/10 rounded-lg transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
