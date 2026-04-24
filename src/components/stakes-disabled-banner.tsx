"use client";

import Link from "next/link";
import { Sparkles, X } from "lucide-react";
import { useState } from "react";
import { useFeatureFlags } from "@/components/feature-flag-provider";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

const DISMISS_KEY = "nf-stakes-banner-dismissed";

export default function StakesDisabledBanner() {
  const { flagStatus, loading } = useFeatureFlags();
  const { locale } = useLocale();
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });

  if (loading) return null;
  if (flagStatus("real_stakes") !== "hidden") return null;
  if (dismissed) return null;

  const t = translations.stakesBanner;

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
        <span className="font-semibold">{t.title[locale]}</span>
        <span className="opacity-90">{t.message[locale]}</span>
      </div>
      <Link
        href="/dashboard"
        className="hidden sm:inline-flex px-2.5 py-0.5 bg-white/15 hover:bg-white/25 rounded-lg transition-colors text-xs font-bold"
      >
        {t.cashoutCta[locale]}
      </Link>
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
