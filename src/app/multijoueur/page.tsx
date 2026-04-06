"use client";

import Link from "next/link";
import { ArrowRight, ArrowLeft, Gamepad2, Brain, Sword, Users } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

export default function MultiplayerPage() {
  const { locale } = useLocale();
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
          <Link href="/lobby"
            className="group flex items-center gap-4 rounded-2xl border-2 border-purple-200/50 bg-gradient-to-r from-purple-500/10 to-blue-500/10 p-5 hover:shadow-lg transition-all">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shrink-0">
              <Users className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-ink text-lg">{locale === "fr" ? "Lobby" : "Lobby"}</h3>
              <p className="text-xs text-ink/50">{locale === "fr" ? "Rejoins une partie ouverte par un autre joueur" : "Join a game created by another player"}</p>
            </div>
            <ArrowRight className="h-5 w-5 text-purple-400 group-hover:translate-x-1 transition-transform" />
          </Link>

          <div className="grid gap-5 grid-cols-2">
            <Link
              href="/morpion"
              className="group relative rounded-3xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-8 shadow-sm hover:shadow-xl hover:border-violet-200 transition-all duration-300 flex flex-col items-center text-center gap-4"
            >
              <div className="h-16 w-16 rounded-2xl bg-violet-50 flex items-center justify-center group-hover:bg-violet-100 transition-colors">
                <Gamepad2 className="h-8 w-8 text-violet-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-ink">
                {translations.landingMorpion.title[locale]}
              </h2>
              <p className="text-sm text-ink/50 leading-relaxed">
                {translations.landingMorpion.desc[locale]}
              </p>
              <span className="mt-auto flex items-center gap-2 text-sm font-semibold text-violet-500 group-hover:gap-3 transition-all">
                {translations.landingMorpion.action[locale]}
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            <Link
              href="/memory"
              className="group relative rounded-3xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-8 shadow-sm hover:shadow-xl hover:border-pink-200 transition-all duration-300 flex flex-col items-center text-center gap-4"
            >
              <div className="h-16 w-16 rounded-2xl bg-pink-50 flex items-center justify-center group-hover:bg-pink-100 transition-colors">
                <Brain className="h-8 w-8 text-pink-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-ink">
                {translations.landingMemory.title[locale]}
              </h2>
              <p className="text-sm text-ink/50 leading-relaxed">
                {translations.landingMemory.desc[locale]}
              </p>
              <span className="mt-auto flex items-center gap-2 text-sm font-semibold text-pink-500 group-hover:gap-3 transition-all">
                {translations.landingMemory.action[locale]}
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            <Link
              href="/relics"
              className="group relative rounded-3xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-8 shadow-sm hover:shadow-xl hover:border-emerald-200 transition-all duration-300 flex flex-col items-center text-center gap-4"
            >
              <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                <Sword className="h-8 w-8 text-emerald-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-ink">
                {translations.landingRelics.title[locale]}
              </h2>
              <p className="text-sm text-ink/50 leading-relaxed">
                {translations.landingRelics.desc[locale]}
              </p>
              <span className="mt-auto flex items-center gap-2 text-sm font-semibold text-emerald-500 group-hover:gap-3 transition-all">
                {translations.landingRelics.action[locale]}
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            <Link
              href="/dames"
              className="group relative rounded-3xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-8 shadow-sm hover:shadow-xl hover:border-amber-200 transition-all duration-300 flex flex-col items-center text-center gap-4"
            >
              <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center group-hover:bg-amber-100 transition-colors text-3xl">
                ♟️
              </div>
              <h2 className="font-display text-2xl font-bold text-ink">
                {translations.landingDames.title[locale]}
              </h2>
              <p className="text-sm text-ink/50 leading-relaxed">
                {translations.landingDames.desc[locale]}
              </p>
              <span className="mt-auto flex items-center gap-2 text-sm font-semibold text-amber-500 group-hover:gap-3 transition-all">
                {translations.landingDames.action[locale]}
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
