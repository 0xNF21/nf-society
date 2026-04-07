"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, Dice5, Swords, ArrowLeftRight, ShoppingBag, FlaskConical, Lock, Trophy } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { useFeatureFlags } from "@/components/feature-flag-provider";
import { translations } from "@/lib/i18n";

export default function LandingPage() {
  const { locale } = useLocale();
  const { isDemo, enterDemo } = useDemo();
  const { isVisible, flagStatus } = useFeatureFlags();
  const t = translations.landing;
  const td = translations.demo;

  const categories = [
    {
      href: "/hub",
      flag: null,
      icon: <Swords className="h-8 w-8 text-marine" />,
      iconBg: "bg-marine/10 group-hover:bg-marine/20",
      borderHover: "hover:border-marine/30",
      title: locale === "fr" ? "Jouer" : "Play",
      desc: locale === "fr" ? "Jeux, classement et boutique" : "Games, leaderboard and shop",
      color: "text-marine",
    },
    {
      href: "/dashboard-dao",
      flag: "governance",
      icon: <BarChart3 className="h-8 w-8 text-emerald-500" />,
      iconBg: "bg-emerald-50 group-hover:bg-emerald-100",
      borderHover: "hover:border-emerald-200",
      title: t.sectionGovernance[locale],
      desc: t.sectionGovernanceDesc[locale],
      color: "text-emerald-500",
    },
    {
      href: "/exchange",
      flag: "exchange",
      icon: <ArrowLeftRight className="h-8 w-8 text-sky-500" />,
      iconBg: "bg-sky-50 group-hover:bg-sky-100",
      borderHover: "hover:border-sky-200",
      title: t.sectionExchange[locale],
      desc: t.sectionExchangeDesc[locale],
      color: "text-sky-500",
    },
  ];

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-2xl flex flex-col items-center gap-10">
          <header className="text-center space-y-4">
            <img
              src="/nf-society-logo.png"
              alt="NF Society"
              className="h-24 w-24 rounded-2xl object-cover mx-auto"
            />
            <h1 className="font-display text-5xl font-bold text-ink dark:text-white sm:text-6xl">
              NF Society
            </h1>
            <p className="text-lg text-ink/60 dark:text-white/60 max-w-md mx-auto">
              {t.subtitle[locale]}
            </p>
          </header>

          <div className="grid gap-5 w-full grid-cols-2">
            {categories.filter((cat) => !cat.flag || isVisible(cat.flag)).map((cat) => {
              const comingSoon = cat.flag && flagStatus(cat.flag) === "coming_soon";
              return (
                <Link
                  key={cat.href}
                  href={comingSoon ? "#" : cat.href}
                  onClick={comingSoon ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                  className={`group relative rounded-3xl border-2 border-ink/5 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-sm p-6 sm:p-8 shadow-sm ${comingSoon ? "" : `hover:shadow-xl ${cat.borderHover}`} transition-all duration-300 flex flex-col items-center text-center gap-3 overflow-hidden`}
                >
                  {comingSoon && (
                    <div className="absolute inset-0 bg-white/60 dark:bg-black/50 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-widest bg-ink/90 dark:bg-white/90 text-white dark:text-ink px-3 py-1.5 rounded-lg -rotate-12 shadow-lg">
                        Coming Soon
                      </span>
                    </div>
                  )}
                  <div className={`h-16 w-16 rounded-2xl ${cat.iconBg} flex items-center justify-center transition-colors`}>
                    {cat.icon}
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl font-bold text-ink dark:text-white">
                    {cat.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-ink/50 dark:text-white/50 leading-relaxed">
                    {cat.desc}
                  </p>
                  <span className={`mt-auto flex items-center gap-2 text-sm font-semibold ${cat.color} group-hover:gap-3 transition-all`}>
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              );
            })}
          </div>

          {!isDemo && (
            <button
              onClick={enterDemo}
              className="flex items-center justify-center gap-2.5 w-full max-w-sm mx-auto py-3 px-6 bg-amber-50 hover:bg-amber-100 border-2 border-amber-200 hover:border-amber-300 rounded-2xl transition-all group"
            >
              <FlaskConical className="h-5 w-5 text-amber-500" />
              <div className="text-left">
                <span className="text-sm font-bold text-amber-800">{td.enter[locale]}</span>
                <p className="text-xs text-amber-600/70">{td.enterDesc[locale]}</p>
              </div>
            </button>
          )}

          <footer className="text-center space-y-3 mt-4">
            <div className="flex items-center justify-center gap-3">
              <img src="/gnosis-logo.png" alt="Gnosis" className="h-5 w-5 opacity-70" />
              <Image src="/logo-color.png" alt="Circles" width={80} height={24} className="h-5 w-auto opacity-70" />
            </div>
            <p className="text-xs text-ink/40">
              {t.footer[locale]}
            </p>
            <div className="flex items-center gap-4">
              <Link href="/docs" className="inline-flex items-center gap-1 text-xs text-ink/30 dark:text-white/30 hover:text-ink/50 dark:hover:text-white/50 transition-colors">
                Documentation
              </Link>
              <Link href="/admin" className="inline-flex items-center gap-1 text-xs text-ink/20 dark:text-white/20 hover:text-ink/40 dark:hover:text-white/40 transition-colors">
                <Lock className="h-3 w-3" />
                Admin
              </Link>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
