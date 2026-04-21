"use client";

import Link from "next/link";
import { ArrowRight, ArrowLeft, Dice5, Swords, Trophy, ShoppingBag } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useFeatureFlags } from "@/components/feature-flag-provider";
import { translations } from "@/lib/i18n";

export default function HubPage() {
  const { locale } = useLocale();
  const { isVisible, flagStatus } = useFeatureFlags();
  const t = translations.landing;

  const sections = [
    {
      href: "/chance",
      flag: "chance",
      icon: <Dice5 className="h-8 w-8 text-amber-500" />,
      iconBg: "bg-amber-50 group-hover:bg-amber-100",
      borderHover: "hover:border-amber-200",
      title: t.sectionChance[locale],
      desc: t.sectionChanceDesc[locale],
      color: "text-amber-500",
    },
    {
      href: "/multijoueur",
      flag: "multiplayer",
      icon: <Swords className="h-8 w-8 text-violet-500" />,
      iconBg: "bg-violet-50 group-hover:bg-violet-100",
      borderHover: "hover:border-violet-200",
      title: t.sectionMultiplayer[locale],
      desc: t.sectionMultiplayerDesc[locale],
      color: "text-violet-500",
    },
    {
      href: "/leaderboard",
      flag: "leaderboard",
      icon: <Trophy className="h-8 w-8 text-amber-500" />,
      iconBg: "bg-amber-50 group-hover:bg-amber-100",
      borderHover: "hover:border-amber-200",
      title: t.leaderboardTitle[locale],
      desc: t.leaderboardDesc[locale],
      color: "text-amber-500",
    },
    {
      href: "/shop",
      flag: "shop",
      icon: <ShoppingBag className="h-8 w-8 text-pink-500" />,
      iconBg: "bg-pink-50 group-hover:bg-pink-100",
      borderHover: "hover:border-pink-200",
      title: t.sectionShop[locale],
      desc: t.sectionShopDesc[locale],
      color: "text-pink-500",
    },
  ];

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center px-4 py-16">
        <div className="w-full max-w-2xl flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <Link href="/home" className="flex items-center gap-2 text-sm text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
              {t.home[locale]}
            </Link>
          </div>

          <header className="text-center space-y-2">
            <span className="text-4xl">🎮</span>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink dark:text-white">
              {t.play[locale]}
            </h1>
            <p className="text-ink/60 dark:text-white/60">
              {t.playDesc[locale]}
            </p>
          </header>

          <div className="grid gap-5 grid-cols-2">
            {sections.filter(s => !s.flag || isVisible(s.flag)).map(section => {
              const comingSoon = section.flag && flagStatus(section.flag) === "coming_soon";
              return (
                <Link
                  key={section.href}
                  href={comingSoon ? "#" : section.href}
                  onClick={comingSoon ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                  className={`group relative rounded-3xl border-2 border-ink/5 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-sm p-8 shadow-sm ${comingSoon ? "" : `hover:shadow-xl ${section.borderHover}`} transition-all duration-300 flex flex-col items-center text-center gap-4 overflow-hidden`}
                >
                  {comingSoon && (
                    <div className="absolute inset-0 bg-white/60 dark:bg-black/50 backdrop-blur-[2px] z-10 flex items-center justify-center">
                      <span className="text-xs font-bold uppercase tracking-widest bg-ink/90 dark:bg-white/90 text-white dark:text-ink px-3 py-1.5 rounded-lg -rotate-12 shadow-lg">
                        Coming Soon
                      </span>
                    </div>
                  )}
                  <div className={`h-16 w-16 rounded-2xl ${section.iconBg} flex items-center justify-center transition-colors`}>
                    {section.icon}
                  </div>
                  <h2 className="font-display text-2xl font-bold text-ink dark:text-white">
                    {section.title}
                  </h2>
                  <p className="text-sm text-ink/50 dark:text-white/50 leading-relaxed">
                    {section.desc}
                  </p>
                  <span className={`mt-auto flex items-center gap-2 text-sm font-semibold ${section.color} group-hover:gap-3 transition-all`}>
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
