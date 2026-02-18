"use client";

import Link from "next/link";
import { ArrowLeft, BarChart3, Construction } from "lucide-react";
import { useLocale, LanguageSwitcher } from "@/components/language-provider";

export default function DashboardDaoPage() {
  const { locale } = useLocale();

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-2xl flex flex-col items-center gap-8">
          <div className="absolute top-4 right-4">
            <LanguageSwitcher />
          </div>
          <div className="absolute top-4 left-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              {locale === "fr" ? "Retour" : "Back"}
            </Link>
          </div>

          <header className="text-center space-y-4">
            <div className="h-20 w-20 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto">
              <BarChart3 className="h-10 w-10 text-emerald-500" />
            </div>
            <h1 className="font-display text-4xl font-bold text-ink">
              Dashboard DAO
            </h1>
            <p className="text-ink/50 max-w-md mx-auto">
              NF Society
            </p>
          </header>

          <div className="rounded-3xl border-2 border-dashed border-ink/10 bg-white/60 p-12 text-center w-full">
            <Construction className="h-12 w-12 text-ink/20 mx-auto mb-4" />
            <p className="text-lg font-medium text-ink/40">
              {locale === "fr" ? "En construction..." : "Under construction..."}
            </p>
            <p className="text-sm text-ink/30 mt-2">
              {locale === "fr"
                ? "Le dashboard DAO sera bientôt disponible."
                : "The DAO dashboard will be available soon."}
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
