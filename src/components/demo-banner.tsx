"use client";

import { X } from "lucide-react";
import { useDemo } from "@/components/demo-provider";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

export default function DemoBanner() {
  const { isDemo, exitDemo } = useDemo();
  const { locale } = useLocale();
  const t = translations.demo;

  if (!isDemo) return null;

  return (
    <div className="sticky top-0 z-50 bg-amber-400 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium shadow-md">
      <span>🧪 {t.banner[locale]}</span>
      <button
        onClick={exitDemo}
        className="flex items-center gap-1 px-2.5 py-0.5 bg-amber-950/10 hover:bg-amber-950/20 rounded-lg transition-colors text-xs font-bold"
      >
        <X className="h-3 w-3" />
        {t.exit[locale]}
      </button>
    </div>
  );
}
