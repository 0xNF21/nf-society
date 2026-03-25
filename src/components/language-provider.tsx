"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { Locale } from "@/lib/i18n";
import { useTheme } from "@/components/theme-provider";

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

// SVG flag icons that render correctly on all platforms (Windows, macOS, iOS, Android)
function FlagFR({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="213.3" height="480" fill="#002395"/>
      <rect x="213.3" width="213.4" height="480" fill="#fff"/>
      <rect x="426.7" width="213.3" height="480" fill="#ed2939"/>
    </svg>
  );
}

function FlagGB({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <path fill="#012169" d="M0 0h640v480H0z"/>
      <path fill="#FFF" d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0z"/>
      <path fill="#C8102E" d="m424 281 216 159v40L369 281zm-184 20 6 35L54 480H0zM640 0v3L391 191l2-44L590 0zM0 0l239 176h-60L0 42z"/>
      <path fill="#FFF" d="M241 0v480h160V0zM0 160v160h640V160z"/>
      <path fill="#C8102E" d="M0 193v96h640v-96zM273 0v480h96V0z"/>
    </svg>
  );
}

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();

  return (
    <div className={`flex items-center gap-1 ${className || ""}`}>
      <button
        onClick={() => setLocale("fr")}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
          locale === "fr"
            ? "bg-ink/10 dark:bg-white/10 text-ink dark:text-white shadow-sm"
            : "text-ink/35 dark:text-white/35 hover:text-ink/60 dark:hover:text-white/60 hover:bg-ink/5 dark:hover:bg-white/5"
        }`}
        title="Français"
      >
        <FlagFR className="h-3.5 w-5 rounded-[2px] shadow-sm flex-shrink-0" />
        <span className="hidden sm:inline">FR</span>
      </button>
      <button
        onClick={() => setLocale("en")}
        className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold transition-all ${
          locale === "en"
            ? "bg-ink/10 dark:bg-white/10 text-ink dark:text-white shadow-sm"
            : "text-ink/35 dark:text-white/35 hover:text-ink/60 dark:hover:text-white/60 hover:bg-ink/5 dark:hover:bg-white/5"
        }`}
        title="English"
      >
        <FlagGB className="h-3.5 w-5 rounded-[2px] shadow-sm flex-shrink-0" />
        <span className="hidden sm:inline">EN</span>
      </button>
      <ThemeToggle />
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      className="ml-1 p-1.5 rounded-lg text-ink/50 dark:text-white/50 hover:bg-ink/5 dark:hover:bg-white/10 transition-all"
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      )}
    </button>
  );
}
