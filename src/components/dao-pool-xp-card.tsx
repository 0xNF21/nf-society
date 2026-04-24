"use client";

import { useEffect, useState } from "react";
import { Gift, TrendingUp } from "lucide-react";
import { useFeatureFlags } from "@/components/feature-flag-provider";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

type DaoPoolSummary = {
  totalXp: number;
  last30dXp: number;
  byGame: Array<{ gameKey: string; totalXp: number }>;
};

/**
 * Carte affichee sur `/dashboard-dao` quand le flag `real_stakes` est sur
 * "hidden" — montre le pot communautaire XP accumule via les commissions
 * des parties F2P (5% multi + house edge chance).
 */
export function DaoPoolXpCard() {
  const { locale } = useLocale();
  const { flagStatus, loading: flagsLoading } = useFeatureFlags();
  const realStakesDisabled = !flagsLoading && flagStatus("real_stakes") === "hidden";
  const t = translations.statsXp;

  const [data, setData] = useState<DaoPoolSummary | null>(null);

  useEffect(() => {
    if (!realStakesDisabled) return;
    let cancelled = false;
    fetch("/api/dao-pool/summary")
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [realStakesDisabled]);

  if (!realStakesDisabled || !data) return null;

  const bcp47 = locale === "fr" ? "fr-FR" : "en-US";
  const fmt = (n: number) => n.toLocaleString(bcp47);

  return (
    <div className="rounded-2xl bg-gradient-to-br from-marine/10 via-citrus/5 to-citrus/10 border border-marine/20 p-5 sm:p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-marine/20 flex items-center justify-center">
          <Gift className="h-5 w-5 text-marine" />
        </div>
        <h2 className="font-display text-xl sm:text-2xl font-bold text-ink dark:text-white">
          {t.daoPoolTitle[locale]}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:gap-6">
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-ink/50 dark:text-white/50">
            {t.daoPoolTotal[locale]}
          </div>
          <div className="mt-1 font-display text-3xl sm:text-4xl font-bold text-marine tabular-nums">
            {fmt(data.totalXp)} <span className="text-base text-ink/50 dark:text-white/50">XP</span>
          </div>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-ink/50 dark:text-white/50 flex items-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            {t.daoPoolMonth[locale]}
          </div>
          <div className="mt-1 font-display text-3xl sm:text-4xl font-bold text-ink dark:text-white tabular-nums">
            {fmt(data.last30dXp)} <span className="text-base text-ink/50 dark:text-white/50">XP</span>
          </div>
        </div>
      </div>
      {data.byGame.length > 0 && (
        <div className="mt-4 pt-4 border-t border-ink/5 dark:border-white/10">
          <div className="flex flex-wrap gap-2">
            {data.byGame.slice(0, 6).map((g) => (
              <span
                key={g.gameKey}
                className="px-2.5 py-1 rounded-full bg-white/70 dark:bg-white/10 text-xs font-semibold text-ink/70 dark:text-white/70"
              >
                {g.gameKey}: {fmt(g.totalXp)} XP
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
