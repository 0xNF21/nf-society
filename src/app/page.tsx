"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, BarChart3, Ticket } from "lucide-react";
import { useLocale, LanguageSwitcher } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import ExchangeSection from "@/components/exchange-section";

export default function LandingPage() {
  const { locale } = useLocale();
  const t = translations.landing;

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-3xl flex flex-col items-center gap-10">
          <div className="absolute top-4 right-4">
            <LanguageSwitcher />
          </div>

          <header className="text-center space-y-4">
            <img
              src="/nf-society-logo.png"
              alt="NF Society"
              className="h-24 w-24 rounded-2xl object-cover mx-auto"
            />
            <h1 className="font-display text-5xl font-bold text-ink sm:text-6xl">
              NF Society
            </h1>
            <p className="text-lg text-ink/60 max-w-md mx-auto">
              {t.subtitle[locale]}
            </p>
          </header>

          <div className="grid gap-6 w-full md:grid-cols-2">
            <Link
              href="/loteries"
              className="group relative rounded-3xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-8 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-300 flex flex-col items-center text-center gap-4"
            >
              <div className="h-16 w-16 rounded-2xl bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-100 transition-colors">
                <Ticket className="h-8 w-8 text-indigo-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-ink">
                {t.lotteriesTitle[locale]}
              </h2>
              <p className="text-sm text-ink/50 leading-relaxed">
                {t.lotteriesDesc[locale]}
              </p>
              <span className="mt-auto flex items-center gap-2 text-sm font-semibold text-indigo-500 group-hover:gap-3 transition-all">
                {t.lotteriesAction[locale]}
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>

            <Link
              href="/dashboard-dao"
              className="group relative rounded-3xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-8 shadow-sm hover:shadow-xl hover:border-emerald-200 transition-all duration-300 flex flex-col items-center text-center gap-4"
            >
              <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors">
                <BarChart3 className="h-8 w-8 text-emerald-500" />
              </div>
              <h2 className="font-display text-2xl font-bold text-ink">
                {t.daoTitle[locale]}
              </h2>
              <p className="text-sm text-ink/50 leading-relaxed">
                {t.daoDesc[locale]}
              </p>
              <span className="mt-auto flex items-center gap-2 text-sm font-semibold text-emerald-500 group-hover:gap-3 transition-all">
                {t.daoAction[locale]}
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>

          <ExchangeSection />

          <footer className="text-center space-y-3 mt-4">
            <div className="flex items-center justify-center gap-3">
              <img src="/gnosis-logo.png" alt="Gnosis" className="h-5 w-5 opacity-70" />
              <Image src="/logo-color.png" alt="Circles" width={80} height={24} className="h-5 w-auto opacity-70" />
            </div>
            <p className="text-xs text-ink/40">
              {t.footer[locale]}
            </p>
          </footer>
        </div>
      </div>
    </main>
  );
}
