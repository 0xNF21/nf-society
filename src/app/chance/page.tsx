"use client";

import Link from "next/link";
import { ArrowLeft, CalendarCheck, Ticket, Gift, ArrowRight, Spade } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useFeatureFlags } from "@/components/feature-flag-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";

export default function ChancePage() {
  const { locale } = useLocale();
  const { isVisible, flagStatus } = useFeatureFlags();
  const { isDemo } = useDemo();
  const t = translations.chance;

  const games = [
    {
      type: "daily" as const,
      flag: "daily",
      icon: <CalendarCheck className="h-8 w-8 text-amber-500" />,
      iconBg: "bg-amber-50 group-hover:bg-amber-100",
      borderHover: "hover:border-amber-200",
      title: t.dailyTitle[locale],
      desc: t.dailyDesc[locale],
      color: "text-amber-500",
      badge: "1 CRC",
    },
    {
      type: "link" as const,
      flag: "lotteries",
      href: "/loteries",
      icon: <Ticket className="h-8 w-8 text-violet-500" />,
      iconBg: "bg-violet-50 group-hover:bg-violet-100",
      borderHover: "hover:border-violet-200",
      title: t.lotteriesTitle[locale],
      desc: t.lotteriesDesc[locale],
      color: "text-violet-500",
    },
    {
      type: "link" as const,
      flag: "lootboxes",
      href: "/lootboxes",
      icon: <Gift className="h-8 w-8 text-emerald-500" />,
      iconBg: "bg-emerald-50 group-hover:bg-emerald-100",
      borderHover: "hover:border-emerald-200",
      title: t.lootboxTitle[locale],
      desc: t.lootboxDesc[locale],
      color: "text-emerald-500",
    },
    {
      type: "link" as const,
      flag: "blackjack",
      href: isDemo ? "/blackjack/DEMO-classic" : "/blackjack",
      icon: <span className="text-3xl">🃏</span>,
      iconBg: "bg-green-50 group-hover:bg-green-100",
      borderHover: "hover:border-green-200",
      title: locale === "fr" ? "Blackjack" : "Blackjack",
      desc: locale === "fr" ? "Blackjack classique contre la banque. 3:2." : "Classic blackjack vs dealer. 3:2.",
      color: "text-green-600",
    },
    {
      type: "link" as const,
      flag: "coin_flip",
      href: isDemo ? "/coin-flip/DEMO-classic" : "/coin-flip",
      icon: <span className="text-3xl">🪙</span>,
      iconBg: "bg-sky-50 group-hover:bg-sky-100",
      borderHover: "hover:border-sky-200",
      title: t.coinFlipTitle[locale],
      desc: t.coinFlipDesc[locale],
      color: "text-sky-600",
    },
  ];

  const handleDailyClick = () => {
    window.dispatchEvent(new Event("open-daily-modal"));
  };

  return (
    <main className="min-h-screen bg-sand text-ink">
      <div className="max-w-2xl mx-auto px-4 pt-16 pb-8">
        <Link href="/" className="inline-flex items-center gap-2 text-ink/60 hover:text-ink mb-6">
          <ArrowLeft className="w-4 h-4" />
          <span>{locale === "fr" ? "Accueil" : "Home"}</span>
        </Link>

        <h1 className="text-3xl font-bold mb-2">{t.title[locale]}</h1>
        <p className="text-ink/60 mb-8">
          {locale === "fr"
            ? "Tentez votre chance avec nos jeux quotidiens et \u00e9v\u00e9nements."
            : "Try your luck with our daily games and events."}
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {games.filter((g) => !g.flag || isVisible(g.flag)).map((game, i) => {
            const comingSoon = game.flag && flagStatus(game.flag) === "coming_soon";

            const inner = (
              <>
                {comingSoon && (
                  <div className="absolute inset-0 bg-white/60 dark:bg-black/50 backdrop-blur-[2px] z-10 flex items-center justify-center rounded-2xl">
                    <span className="text-xs font-bold uppercase tracking-widest bg-ink/90 dark:bg-white/90 text-white dark:text-ink px-3 py-1.5 rounded-lg -rotate-12 shadow-lg">
                      Coming Soon
                    </span>
                  </div>
                )}
                {game.badge && !comingSoon && (
                  <span className="absolute top-2 right-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                    {game.badge}
                  </span>
                )}
                <div className={`h-14 w-14 rounded-xl ${game.iconBg} flex items-center justify-center transition-colors`}>
                  {game.icon}
                </div>
                <h2 className="font-bold text-lg text-ink">{game.title}</h2>
                <p className="text-sm text-ink/50 leading-snug">{game.desc}</p>
                <div className={`flex items-center gap-1 text-sm font-medium ${game.color} mt-auto`}>
                  <span>{t.action[locale]}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </>
            );

            const baseClass = `group relative rounded-2xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-5 shadow-sm ${comingSoon ? "" : `hover:shadow-lg ${game.borderHover}`} transition-all duration-300 flex flex-col items-center text-center gap-3 overflow-hidden`;

            if (comingSoon) {
              return (
                <div key={i} className={baseClass}>
                  {inner}
                </div>
              );
            }

            if (game.type === "daily") {
              return (
                <button key={i} onClick={handleDailyClick} className={baseClass}>
                  {inner}
                </button>
              );
            }

            return (
              <Link key={i} href={game.href!} className={baseClass}>
                {inner}
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}
