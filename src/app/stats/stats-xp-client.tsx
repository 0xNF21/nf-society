"use client";

import Link from "next/link";
import { ArrowLeft, Sparkles, Users, Trophy, Zap, Gift } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import type { XpPlatformStats } from "@/lib/platform-stats-xp";

const GAME_LABELS: Record<string, { fr: string; en: string }> = {
  morpion: { fr: "Morpion", en: "Tic-Tac-Toe" },
  memory: { fr: "Memory", en: "Memory" },
  dames: { fr: "Dames", en: "Checkers" },
  relics: { fr: "Relics", en: "Relics" },
  pfc: { fr: "Pierre-Feuille-Ciseaux", en: "Rock-Paper-Scissors" },
  "crc-races": { fr: "Courses", en: "Races" },
  roulette: { fr: "Roulette", en: "Roulette" },
  dice: { fr: "Dice", en: "Dice" },
  plinko: { fr: "Plinko", en: "Plinko" },
  mines: { fr: "Mines", en: "Mines" },
  hilo: { fr: "Hi-Lo", en: "Hi-Lo" },
  keno: { fr: "Keno", en: "Keno" },
  blackjack: { fr: "Blackjack", en: "Blackjack" },
  coin_flip: { fr: "Pile ou Face", en: "Coin Flip" },
  crash_dash: { fr: "Demurrage Dash", en: "Demurrage Dash" },
  lootbox: { fr: "Lootbox", en: "Lootbox" },
  lottery: { fr: "Loterie", en: "Lottery" },
};

export default function StatsXpClient({ stats }: { stats: XpPlatformStats }) {
  const { locale } = useLocale();
  const t = translations.statsXp;
  const bcp47 = locale === "fr" ? "fr-FR" : "en-US";
  const fmt = (n: number) => n.toLocaleString(bcp47);

  const { allTime, daoPool, byGame } = stats;
  const isEmpty = allTime.rounds === 0;

  return (
    <main className="min-h-screen bg-cream/40 dark:bg-ink/95">
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-ink/60 dark:text-white/60 hover:text-marine"
        >
          <ArrowLeft className="h-4 w-4" />
          Accueil
        </Link>

        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink dark:text-white">
            {t.title[locale]}
          </h1>
          <p className="mt-2 text-ink/60 dark:text-white/60 text-sm">{t.subtitle[locale]}</p>
        </div>

        {isEmpty ? (
          <div className="rounded-2xl bg-white dark:bg-white/5 border border-ink/5 dark:border-white/10 p-8 text-center">
            <Sparkles className="h-10 w-10 mx-auto text-ink/20 dark:text-white/20 mb-3" />
            <p className="text-ink/60 dark:text-white/60">{t.empty[locale]}</p>
          </div>
        ) : (
          <>
            {/* ─── KPIs ───────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <Kpi icon={<Sparkles className="h-5 w-5" />} label={t.kpiRounds[locale]} value={fmt(allTime.rounds)} />
              <Kpi icon={<Users className="h-5 w-5" />} label={t.kpiPlayers[locale]} value={fmt(allTime.players)} />
              <Kpi
                icon={<Zap className="h-5 w-5" />}
                label={t.kpiWagered[locale]}
                value={fmt(allTime.wagered)}
                unit="XP"
              />
              <Kpi
                icon={<Trophy className="h-5 w-5" />}
                label={t.kpiPaidOut[locale]}
                value={fmt(allTime.paidOut)}
                unit="XP"
              />
            </div>

            {/* ─── DAO pool ──────────────────────────── */}
            <div className="rounded-2xl bg-gradient-to-br from-marine/10 to-citrus/10 border border-marine/20 p-5 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-marine/20 flex items-center justify-center">
                  <Gift className="h-5 w-5 text-marine" />
                </div>
                <h2 className="font-display text-xl font-bold text-ink dark:text-white">
                  {t.daoPoolTitle[locale]}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-ink/50 dark:text-white/50">
                    {t.daoPoolTotal[locale]}
                  </div>
                  <div className="mt-1 font-display text-3xl font-bold text-marine tabular-nums">
                    {fmt(daoPool.totalXp)}{" "}
                    <span className="text-base text-ink/50 dark:text-white/50">XP</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-widest text-ink/50 dark:text-white/50">
                    {t.daoPoolMonth[locale]}
                  </div>
                  <div className="mt-1 font-display text-3xl font-bold text-ink dark:text-white tabular-nums">
                    {fmt(daoPool.last30dXp)}{" "}
                    <span className="text-base text-ink/50 dark:text-white/50">XP</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── By game table ─────────────────────── */}
            <div className="rounded-2xl bg-white dark:bg-white/5 border border-ink/5 dark:border-white/10 overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <h2 className="font-display text-xl font-bold text-ink dark:text-white">
                  {t.byGameTitle[locale]}
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase tracking-wider text-ink/50 dark:text-white/50 border-b border-ink/5 dark:border-white/10">
                    <tr>
                      <th className="text-left px-5 py-2">{t.colGame[locale]}</th>
                      <th className="text-right px-5 py-2">{t.colRounds[locale]}</th>
                      <th className="text-right px-5 py-2">{t.colPlayers[locale]}</th>
                      <th className="text-right px-5 py-2">{t.colWagered[locale]}</th>
                      <th className="text-right px-5 py-2">{t.colPaidOut[locale]}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byGame.map((row) => (
                      <tr key={row.gameKey} className="border-b border-ink/5 dark:border-white/10 last:border-0">
                        <td className="px-5 py-2.5 font-semibold text-ink dark:text-white">
                          {GAME_LABELS[row.gameKey]?.[locale] ?? row.gameKey}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-ink/70 dark:text-white/70">
                          {fmt(row.rounds)}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-ink/70 dark:text-white/70">
                          {fmt(row.uniquePlayers)}
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-ink/70 dark:text-white/70">
                          {fmt(row.wagered)} <span className="text-xs opacity-60">XP</span>
                        </td>
                        <td className="px-5 py-2.5 text-right tabular-nums text-ink/70 dark:text-white/70">
                          {fmt(row.paidOut)} <span className="text-xs opacity-60">XP</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Kpi({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-white/5 border border-ink/5 dark:border-white/10 p-5">
      <div className="flex items-center gap-2 text-ink/50 dark:text-white/50 text-xs font-semibold uppercase tracking-widest">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-bold text-ink dark:text-white tabular-nums">
        {value}
        {unit ? <span className="text-base text-ink/50 dark:text-white/50 ml-1">{unit}</span> : null}
      </div>
    </div>
  );
}
