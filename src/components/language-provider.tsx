"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Locale } from "@/lib/i18n";

type LanguageContextType = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextType>({
  locale: "fr",
  setLocale: () => {},
});

export function useLocale() {
  return useContext(LanguageContext);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    const saved = localStorage.getItem("nf-locale") as Locale | null;
    if (saved === "en" || saved === "fr") {
      setLocaleState(saved);
    }
  }, []);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("nf-locale", l);
  }, []);

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();

  return (
    <div className={`flex items-center gap-1 ${className || ""}`}>
      <button
        onClick={() => setLocale("fr")}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium transition-all ${
          locale === "fr"
            ? "bg-ink/10 text-ink shadow-sm"
            : "text-ink/40 hover:text-ink/60 hover:bg-ink/5"
        }`}
        title="Français"
      >
        <span className="text-base leading-none">🇫🇷</span>
        <span className="hidden sm:inline text-xs">FR</span>
      </button>
      <button
        onClick={() => setLocale("en")}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-sm font-medium transition-all ${
          locale === "en"
            ? "bg-ink/10 text-ink shadow-sm"
            : "text-ink/40 hover:text-ink/60 hover:bg-ink/5"
        }`}
        title="English"
      >
        <span className="text-base leading-none">🇬🇧</span>
        <span className="hidden sm:inline text-xs">EN</span>
      </button>
    </div>
  );
}
