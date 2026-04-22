"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import ExchangeSection from "@/components/exchange-section";

export default function ExchangePage() {
  const { locale } = useLocale();
  const t = translations.landing;

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center px-4 py-16">
        <div className="w-full max-w-2xl flex flex-col gap-8">
          <div className="flex items-center gap-4">
            <Link
              href="/home"
              className="flex items-center gap-2 text-sm text-ink/50 hover:text-ink transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {t.back[locale]}
            </Link>
          </div>

          <header className="text-center space-y-2">
            <span className="text-4xl">💱</span>
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-ink">
              {t.sectionExchange[locale]}
            </h1>
            <p className="text-ink/60">
              {t.sectionExchangeDesc[locale]}
            </p>
          </header>

          <ExchangeSection />
        </div>
      </div>
    </main>
  );
}
