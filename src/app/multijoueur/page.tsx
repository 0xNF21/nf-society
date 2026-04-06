"use client";

import Link from "next/link";
import { ArrowRight, ArrowLeft, Gamepad2, Brain, Sword, Users } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useFeatureFlags } from "@/components/feature-flag-provider";
import { translations } from "@/lib/i18n";

const GAMES = [
  {
    flag: "morpion",
    href: "/morpion",
    icon: Gamepad2,
    iconColor: "text-violet-500",
    iconBg: "bg-violet-50 group-hover:bg-violet-100",
    borderHover: "hover:border-violet-200",
    color: "text-violet-500",
    tKey: "landingMorpion" as const,
  },
  {
    flag: "memory",
    href: "/memory",
    icon: Brain,
    iconColor: "text-pink-500",
    iconBg: "bg-pink-50 group-hover:bg-pink-100",
    borderHover: "hover:border-pink-200",
    color: "text-pink-500",
    tKey: "landingMemory" as const,
  },
  {
    flag: "relics",
    href: "/relics",
    icon: Sword,
    iconColor: "text-emerald-500",
    iconBg: "bg-emerald-50 group-hover:bg-emerald-100",
    borderHover: "hover:border-emerald-200",
    color: "text-emerald-500",
    tKey: "landingRelics" as const,
  },
  {
    flag: "dames",
    href: "/dames",
    icon: null,
    emoji: "\u265F\uFE0F",
    iconColor: "text-amber-500",
    iconBg: "bg-amber-50 group-hover:bg-amber-100",
    borderHover: "hover:border-amber-200",
    color: "text-amber-500",
    tKey: "landingDames" as const,
  },
];

export default function MultiplayerPage() {
  const { locale } = useLocale();
  const { isVisible, flagStatus } = useFeatureFlags();
  const t = translations.landing;

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center px-4 py-16">
        <div className="w-full max-w-2xl flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-ink/50 hover:text-ink transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.back[locale]}
            </Link>
          </div>

          <header className="text-center space-y-2">
            <span className="text-4xl">⚔️</span>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">
              {t.sectionMultiplayer[locale]}
            </h1>
            <p className="text-ink/60">
              {t.sectionMultiplayerDesc[locale]}
            </p>
          </header>

          {/* Lobby banner */}
          {isVisible("lobby") && (() => {
            const lobbyCS = flagStatus("lobby") === "coming_soon";
            return (
              <Link href={lobbyCS ? "#" : "/lobby"}
                onClick={lobbyCS ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                className={`group relative flex items-center gap-4 rounded-2xl border-2 border-purple-200/50 bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-5 ${lobbyCS ? "" : "hover:shadow-lg"} transition-all overflow-hidden`}>
                {lobbyCS && (
                  <div className="absolute inset-0 bg-white/60 dark:bg-black/50 backdrop-blur-[2px] z-10 flex items-center justify-center">
                    <span className="text-xs font-bold uppercase tracking-widest bg-ink/90 dark:bg-white/90 text-white dark:text-ink px-3 py-1.5 rounded-lg -rotate-6 shadow-lg">
                      Coming Soon
                    </span>
                  </div>
                )}
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shrink-0">
                  <Users className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-ink text-lg">{locale === "fr" ? "Lobby" : "Lobby"}</h3>
                  <p className="text-xs text-ink/50">{locale === "fr" ? "Rejoins une partie ouverte par un autre joueur" : "Join a game created by another player"}</p>
                </div>
                <ArrowRight className="h-5 w-5 text-purple-400 group-hover:translate-x-1 transition-transform" />
              </Link>
            );
          })()}

          <div className="grid gap-5 grid-cols-2">
            {GAMES.filter((g) => isVisible(g.flag)).map((game) => {
              const comingSoon = flagStatus(game.flag) === "coming_soon";
              const tSection = translations[game.tKey];
              const Icon = game.icon;
              return (
                <Link
                  key={game.href}
                  href={comingSoon ? "#" : game.href}
                  onClick={comingSoon ? (e: React.MouseEvent) => e.preventDefault() : undefined}
                  className={`group relative rounded-3xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-8 shadow-sm ${comingSoon ? "" : `hover:shadow-xl ${game.borderHover}`} transition-all duration-300 flex flex-col items-center text-center gap-4 overflow-hidden`}
                >
                  {comingSoon && (
                    <div className="absolute inset-0 bg-white/60 dark:bg-black/50 backdrop-blur-[2px] z-10 flex items-center justify-center">
                      <span className="text-xs font-bold uppercase tracking-widest bg-ink/90 dark:bg-white/90 text-white dark:text-ink px-3 py-1.5 rounded-lg -rotate-12 shadow-lg">
                        Coming Soon
                      </span>
                    </div>
                  )}
                  <div className={`h-16 w-16 rounded-2xl ${game.iconBg} flex items-center justify-center transition-colors ${Icon ? "" : "text-3xl"}`}>
                    {Icon ? <Icon className={`h-8 w-8 ${game.iconColor}`} /> : game.emoji}
                  </div>
                  <h2 className="font-display text-2xl font-bold text-ink">
                    {tSection.title[locale]}
                  </h2>
                  <p className="text-sm text-ink/50 leading-relaxed">
                    {tSection.desc[locale]}
                  </p>
                  <span className={`mt-auto flex items-center gap-2 text-sm font-semibold ${game.color} group-hover:gap-3 transition-all`}>
                    {tSection.action[locale]}
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
