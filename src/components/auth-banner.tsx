"use client";

import { LogIn } from "lucide-react";
import { useAuthSession } from "@/components/auth-provider";
import { useDemo } from "@/components/demo-provider";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

/**
 * Banner displayed when the user is not authenticated. Provides a single
 * entry point to the login flow. Hidden in demo mode (where no auth is
 * needed since nothing hits the API).
 *
 * This is intentionally minimal — the next iteration will integrate the
 * "Sign in" CTA into the existing ProfileModal / BottomNav for a smoother
 * UX. For now it's visible everywhere so users have an obvious recovery
 * path when a route returns 401.
 */
export function AuthBanner() {
  const { isAuthenticated, loading, openLogin } = useAuthSession();
  const { isDemo } = useDemo();
  const { locale } = useLocale();
  const t = translations.authBanner;

  if (isDemo) return null;
  if (loading) return null;
  if (isAuthenticated) return null;

  return (
    <div className="bg-marine text-white text-sm px-4 py-2.5 flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 truncate">
        <LogIn className="h-4 w-4 shrink-0" />
        <span className="truncate">{t.notice[locale]}</span>
      </span>
      <button
        onClick={openLogin}
        className="shrink-0 px-3 py-1 rounded-md bg-white/15 hover:bg-white/25 transition-colors font-semibold text-xs"
      >
        {t.connect[locale]}
      </button>
    </div>
  );
}
