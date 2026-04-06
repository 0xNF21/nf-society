"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Dice5, Swords, ShoppingBag } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useFeatureFlags } from "@/components/feature-flag-provider";

const NAV_ITEMS = [
  { href: "/", icon: Home, label: { fr: "Accueil", en: "Home" }, flag: null },
  { href: "/chance", icon: Dice5, label: { fr: "Chance", en: "Chance" }, flag: "chance" },
  { href: "/multijoueur", icon: Swords, label: { fr: "Jeux", en: "Games" }, flag: "multiplayer" },
  { href: "/shop", icon: ShoppingBag, label: { fr: "Shop", en: "Shop" }, flag: "shop" },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const { locale } = useLocale();
  const { isVisible, flagStatus } = useFeatureFlags();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 dark:bg-black/80 backdrop-blur-lg border-t border-ink/10 dark:border-white/10 pb-[env(safe-area-inset-bottom)] sm:hidden">
      <div className="flex items-center justify-around h-14">
        {NAV_ITEMS.filter(({ flag }) => !flag || isVisible(flag)).map(({ href, icon: Icon, label, flag }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const comingSoon = flag && flagStatus(flag) === "coming_soon";
          return (
            <Link
              key={href}
              href={comingSoon ? "#" : href}
              onClick={comingSoon ? (e) => e.preventDefault() : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] transition-colors ${
                comingSoon
                  ? "text-ink/25 dark:text-white/25 pointer-events-auto"
                  : isActive
                    ? "text-marine dark:text-blue-400"
                    : "text-ink/40 dark:text-white/40"
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive && !comingSoon ? 2.5 : 2} />
              <span className="text-[10px] font-semibold leading-none">{label[locale]}</span>
              {comingSoon && (
                <span className="absolute -top-1 -right-1 text-[7px] font-bold bg-amber-400 text-amber-900 px-1 py-px rounded-full leading-none whitespace-nowrap">
                  SOON
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
