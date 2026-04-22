"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  FlaskConical,
  Sparkles,
  Users,
  Wallet,
  ShieldCheck,
  Zap,
  Vote,
  Github,
  Lock,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { useFeatureFlags } from "@/components/feature-flag-provider";
import { translations } from "@/lib/i18n";
import { GAME_REGISTRY, CHANCE_REGISTRY } from "@/lib/game-registry";
import LandingHeroMockup from "@/components/landing-hero-mockup";

const MULTI_EMOJI: Record<string, string> = {
  morpion: "❌⭕",
  memory: "🃏",
  relics: "⚓",
  dames: "♟️",
  pfc: "✊",
  "crc-races": "🏇",
};

const MULTI_LABEL: Record<string, { fr: string; en: string }> = {
  morpion: { fr: "Morpion", en: "Tic-Tac-Toe" },
  memory: { fr: "Memory", en: "Memory" },
  relics: { fr: "Relics", en: "Relics" },
  dames: { fr: "Dames", en: "Checkers" },
  pfc: { fr: "Pierre-Feuille-Ciseaux", en: "Rock-Paper-Scissors" },
  "crc-races": { fr: "Courses CRC", en: "CRC Races" },
};

const CHANCE_LABEL: Record<string, { fr: string; en: string }> = {
  daily: { fr: "Daily Reward", en: "Daily Reward" },
  lotteries: { fr: "Loteries", en: "Lotteries" },
  lootboxes: { fr: "Lootboxes", en: "Lootboxes" },
  blackjack: { fr: "Blackjack", en: "Blackjack" },
  coin_flip: { fr: "Pile ou Face", en: "Coin Flip" },
  hilo: { fr: "Hi-Lo", en: "Hi-Lo" },
  mines: { fr: "Mines", en: "Mines" },
  dice: { fr: "Dice", en: "Dice" },
  crash_dash: { fr: "Demurrage Dash", en: "Demurrage Dash" },
  keno: { fr: "Keno", en: "Keno" },
  roulette: { fr: "Roulette", en: "Roulette" },
  plinko: { fr: "Plinko", en: "Plinko" },
};

const CHANCE_EMOJI: Record<string, string> = {
  daily: "🎁",
  lotteries: "🎟️",
  lootboxes: "📦",
  blackjack: "🂡",
  coin_flip: "🪙",
  hilo: "🔺",
  mines: "💣",
  dice: "🎲",
  crash_dash: "📉",
  keno: "🎱",
  roulette: "🎡",
  plinko: "🟣",
};

type PlatformStatsLite = {
  allTime: { rounds: number; players: number; wagered: number; paidOut: number };
  casinoBank: { totalCrc: string };
};

export default function LandingPage() {
  const { locale } = useLocale();
  const { enterDemo } = useDemo();
  const { isVisible } = useFeatureFlags();
  const router = useRouter();
  const t = translations.landingMarketing;

  const [stats, setStats] = useState<PlatformStatsLite | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stats/platform")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled || !data) return;
        setStats({
          allTime: data.allTime,
          casinoBank: data.casinoBank,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function handleTryDemo() {
    enterDemo();
    router.push("/home");
  }

  const multiGames = Object.values(GAME_REGISTRY).filter((g) => isVisible(g.featureFlag));
  const chanceGames = Object.values(CHANCE_REGISTRY).filter((g) => isVisible(g.featureFlag));

  return (
    <main className="min-h-screen flex flex-col">
      {/* ─── Top bar (logo uniquement — les floaters globaux occupent la droite) */}
      <header className="absolute top-0 left-0 z-20 p-4">
        <Link href="/" className="flex items-center gap-2">
          <img src="/nf-society-logo.png" alt="NF Society" className="h-8 w-8 rounded-lg" />
          <span className="font-display font-bold text-ink dark:text-white">NF Society</span>
        </Link>
      </header>

      {/* ─── Hero ────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-marine/5 via-transparent to-transparent dark:from-marine/20" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-citrus/10 via-transparent to-transparent" />
        <div className="max-w-4xl mx-auto px-4 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-marine/10 text-marine text-xs font-semibold mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            {t.heroTagline[locale]}
          </div>
          <h1 className="font-display text-4xl sm:text-6xl font-bold text-ink dark:text-white leading-tight tracking-tight">
            {t.heroTitle[locale]}
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-ink/60 dark:text-white/60 max-w-2xl mx-auto">
            {t.heroSubtitle[locale]}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-stretch sm:items-start justify-center gap-4">
            <div className="flex flex-col items-center gap-1.5 w-full sm:w-auto">
              <button
                onClick={handleTryDemo}
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-marine text-white font-bold shadow-lg hover:shadow-xl hover:bg-marine/90 transition-all w-full sm:w-auto"
              >
                <FlaskConical className="h-5 w-5" />
                {t.heroCtaPrimary[locale]}
                <ArrowRight className="h-4 w-4" />
              </button>
              <span className="text-xs text-ink/40 dark:text-white/40">{t.heroCtaPrimaryHint[locale]}</span>
            </div>
            <div className="flex flex-col items-center gap-1.5 w-full sm:w-auto">
              <Link
                href="/home"
                className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-white dark:bg-white/10 border-2 border-ink/10 dark:border-white/10 text-ink dark:text-white font-bold hover:border-marine/30 hover:shadow-md transition-all w-full sm:w-auto"
              >
                <Wallet className="h-5 w-5" />
                {t.heroCtaSecondary[locale]}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="text-xs text-ink/40 dark:text-white/40">{t.heroCtaSecondaryHint[locale]}</span>
            </div>
          </div>
          <div className="mt-16 sm:mt-20">
            <LandingHeroMockup />
          </div>
        </div>
      </section>

      {/* ─── Stats ───────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 pb-16 w-full">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            icon={<Sparkles className="h-5 w-5" />}
            value={stats ? stats.allTime.rounds.toLocaleString(locale) : null}
            label={t.statsPlayed[locale]}
            loading={t.statsLoading[locale]}
          />
          <StatCard
            icon={<Users className="h-5 w-5" />}
            value={stats ? stats.allTime.players.toLocaleString(locale) : null}
            label={t.statsPlayers[locale]}
            loading={t.statsLoading[locale]}
          />
          <StatCard
            icon={<Zap className="h-5 w-5" />}
            value={stats ? Math.round(stats.allTime.wagered).toLocaleString(locale) : null}
            label={t.statsWagered[locale]}
            loading={t.statsLoading[locale]}
          />
          <StatCard
            icon={<Wallet className="h-5 w-5" />}
            value={stats ? Math.round(stats.allTime.paidOut).toLocaleString(locale) : null}
            label={t.statsPaidOut[locale]}
            loading={t.statsLoading[locale]}
          />
        </div>
      </section>

      {/* ─── Games grid ──────────────────────────────────── */}
      <section id="games" className="max-w-6xl mx-auto px-4 py-16 w-full">
        <div className="text-center mb-10">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink dark:text-white">
            {t.gamesTitle[locale]}
          </h2>
          <p className="mt-3 text-ink/60 dark:text-white/60">{t.gamesSubtitle[locale]}</p>
        </div>

        {multiGames.length > 0 && (
          <>
            <h3 className="font-display text-sm font-bold uppercase tracking-widest text-ink/40 dark:text-white/40 mb-4">
              {t.gamesCategoryMulti[locale]}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mb-10">
              {multiGames.map((g) => (
                <GameTile
                  key={g.key}
                  href={`/${g.key}`}
                  emoji={MULTI_EMOJI[g.key] ?? g.emoji}
                  label={MULTI_LABEL[g.key]?.[locale] ?? g.key}
                  accent={g.accentColor}
                />
              ))}
            </div>
          </>
        )}

        {chanceGames.length > 0 && (
          <>
            <h3 className="font-display text-sm font-bold uppercase tracking-widest text-ink/40 dark:text-white/40 mb-4">
              {t.gamesCategoryChance[locale]}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {chanceGames.map((g) => (
                <GameTile
                  key={g.key}
                  href={`/${g.key === "lotteries" ? "loteries" : g.key === "coin_flip" ? "coin-flip" : g.key === "crash_dash" ? "crash-dash" : g.key}`}
                  emoji={CHANCE_EMOJI[g.key] ?? "🎮"}
                  label={CHANCE_LABEL[g.key]?.[locale] ?? g.label}
                />
              ))}
            </div>
          </>
        )}

        <div className="mt-10 text-center">
          <Link
            href="/home"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-marine font-semibold hover:underline"
          >
            {t.gamesViewAll[locale]}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ─── How it works ────────────────────────────────── */}
      <section className="bg-ink/[0.02] dark:bg-white/[0.02] py-20 border-y border-ink/5 dark:border-white/5">
        <div className="max-w-5xl mx-auto px-4">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink dark:text-white text-center mb-12">
            {t.howTitle[locale]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <HowStep icon={<Wallet className="h-6 w-6" />} title={t.howStep1Title[locale]} desc={t.howStep1Desc[locale]} />
            <HowStep icon={<Sparkles className="h-6 w-6" />} title={t.howStep2Title[locale]} desc={t.howStep2Desc[locale]} />
            <HowStep icon={<Zap className="h-6 w-6" />} title={t.howStep3Title[locale]} desc={t.howStep3Desc[locale]} />
          </div>
        </div>
      </section>

      {/* ─── Why ─────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 py-20 w-full">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink dark:text-white text-center mb-10">
          {t.whyTitle[locale]}
        </h2>
        <ul className="space-y-3 max-w-2xl mx-auto">
          {[t.why1, t.why2, t.why3, t.why4, t.why5].map((msg, i) => (
            <li
              key={i}
              className="flex items-start gap-3 p-4 rounded-2xl bg-white dark:bg-white/5 border border-ink/5 dark:border-white/10"
            >
              <ShieldCheck className="h-5 w-5 text-marine shrink-0 mt-0.5" />
              <span className="text-ink dark:text-white">{msg[locale]}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────── */}
      <section className="bg-ink/[0.02] dark:bg-white/[0.02] py-20 border-y border-ink/5 dark:border-white/5">
        <div className="max-w-3xl mx-auto px-4">
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-ink dark:text-white text-center mb-10">
            {t.faqTitle[locale]}
          </h2>
          <div className="space-y-3">
            {[
              { q: t.faqQ1, a: t.faqA1 },
              { q: t.faqQ2, a: t.faqA2 },
              { q: t.faqQ3, a: t.faqA3 },
              { q: t.faqQ4, a: t.faqA4 },
              { q: t.faqQ5, a: t.faqA5 },
              { q: t.faqQ6, a: t.faqA6 },
            ].map((item, i) => (
              <details
                key={i}
                className="group rounded-2xl bg-white dark:bg-white/5 border border-ink/5 dark:border-white/10 overflow-hidden"
              >
                <summary className="flex items-center justify-between gap-4 p-5 cursor-pointer list-none hover:bg-ink/[0.02] dark:hover:bg-white/[0.02] transition-colors">
                  <span className="font-semibold text-ink dark:text-white">{item.q[locale]}</span>
                  <ArrowRight className="h-4 w-4 text-ink/40 shrink-0 transition-transform group-open:rotate-90" />
                </summary>
                <p className="px-5 pb-5 text-sm text-ink/70 dark:text-white/70 leading-relaxed">
                  {item.a[locale]}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ───────────────────────────────────── */}
      <section className="max-w-3xl mx-auto px-4 pb-20 text-center w-full">
        <div className="rounded-3xl bg-gradient-to-br from-marine to-marine/80 text-white p-10 shadow-xl">
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-3">
            {t.finalCtaTitle[locale]}
          </h2>
          <button
            onClick={handleTryDemo}
            className="mt-4 inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white text-marine font-bold shadow-lg hover:shadow-2xl transition-all"
          >
            <FlaskConical className="h-5 w-5" />
            {t.finalCtaButton[locale]}
            <ArrowRight className="h-4 w-4" />
          </button>
          <p className="mt-3 text-sm text-white/80">{t.finalCtaHint[locale]}</p>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-ink/5 dark:border-white/10 py-10">
        <div className="max-w-5xl mx-auto px-4 space-y-6 text-sm text-ink/50 dark:text-white/50">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/gnosis-logo.png" alt="Gnosis" className="h-4 w-4 opacity-70" />
              <Image src="/logo-color.png" alt="Circles" width={60} height={18} className="h-4 w-auto opacity-70" />
              <span className="text-xs">{t.footerTagline[locale]}</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <Link href="/dashboard-dao" className="hover:text-ink dark:hover:text-white transition-colors">
                {t.footerDao[locale]}
              </Link>
              <Link href="/stats" className="hover:text-ink dark:hover:text-white transition-colors">
                {t.footerStats[locale]}
              </Link>
              <Link href="/docs" className="hover:text-ink dark:hover:text-white transition-colors">
                {t.footerDocs[locale]}
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pt-4 border-t border-ink/5 dark:border-white/10 text-xs">
            <Link href="/legal/terms" className="hover:text-ink dark:hover:text-white transition-colors">
              {t.footerTerms[locale]}
            </Link>
            <Link href="/legal/privacy" className="hover:text-ink dark:hover:text-white transition-colors">
              {t.footerPrivacy[locale]}
            </Link>
            <Link href="/legal/cookies" className="hover:text-ink dark:hover:text-white transition-colors">
              {t.footerCookies[locale]}
            </Link>
            <Link href="/legal/imprint" className="hover:text-ink dark:hover:text-white transition-colors">
              {t.footerImprint[locale]}
            </Link>
            <Link href="/admin" className="inline-flex items-center gap-1 text-ink/20 hover:text-ink/50 transition-colors ml-auto">
              <Lock className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function StatCard({
  icon,
  value,
  label,
  loading,
}: {
  icon: React.ReactNode;
  value: string | null;
  label: string;
  loading: string;
}) {
  return (
    <div className="rounded-2xl bg-white dark:bg-white/5 border border-ink/5 dark:border-white/10 p-5">
      <div className="flex items-center gap-2 text-ink/50 dark:text-white/50 text-xs font-semibold uppercase tracking-widest">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-display text-3xl font-bold text-ink dark:text-white">
        {value ?? <span className="text-ink/30 dark:text-white/30 text-base font-normal">{loading}</span>}
      </div>
    </div>
  );
}

function HowStep({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-white dark:bg-white/5 border border-ink/5 dark:border-white/10 p-6 flex flex-col items-center text-center">
      <div className="h-12 w-12 rounded-2xl bg-marine/10 text-marine flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-display text-lg font-bold text-ink dark:text-white mb-2">{title}</h3>
      <p className="text-sm text-ink/60 dark:text-white/60">{desc}</p>
    </div>
  );
}

function GameTile({
  href,
  emoji,
  label,
  accent,
}: {
  href: string;
  emoji: string;
  label: string;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      className="group relative rounded-2xl bg-white dark:bg-white/5 border border-ink/5 dark:border-white/10 p-4 flex flex-col items-center text-center gap-2 hover:border-marine/30 hover:shadow-md transition-all"
      style={accent ? { ["--accent" as any]: accent } : undefined}
    >
      <div className="text-3xl">{emoji}</div>
      <div className="text-xs font-semibold text-ink dark:text-white line-clamp-1">{label}</div>
    </Link>
  );
}
