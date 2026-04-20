"use client";

import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const t = translations.legal;

  return (
    <main className="min-h-screen">
      <header className="max-w-3xl mx-auto px-4 pt-8 pb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-ink/60 dark:text-white/60 hover:text-ink dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {t.backHome[locale]}
        </Link>
      </header>

      <div className="max-w-3xl mx-auto px-4 pb-20">
        <div className="flex items-start gap-3 p-4 mb-8 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <p>{t.draftNotice[locale]}</p>
        </div>
        <article className="space-y-4 text-ink/80 dark:text-white/80 leading-relaxed [&_h1]:font-display [&_h1]:text-3xl [&_h1]:sm:text-4xl [&_h1]:font-bold [&_h1]:text-ink [&_h1]:dark:text-white [&_h1]:mb-4 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_h2]:dark:text-white [&_h2]:mt-8 [&_h2]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1 [&_a]:text-marine [&_a]:hover:underline">
          {children}
        </article>
      </div>
    </main>
  );
}
