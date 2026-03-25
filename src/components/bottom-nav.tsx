"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Dice5, Swords, ShoppingBag, User } from "lucide-react";
import { useLocale } from "@/components/language-provider";

const NAV_ITEMS = [
  { href: "/", icon: Home, label: { fr: "Accueil", en: "Home" } },
  { href: "/chance", icon: Dice5, label: { fr: "Chance", en: "Chance" } },
  { href: "/multijoueur", icon: Swords, label: { fr: "Jeux", en: "Games" } },
  { href: "/shop", icon: ShoppingBag, label: { fr: "Shop", en: "Shop" } },
] as const;

export default function BottomNav() {
  const pathname = usePathname();
  const { locale } = useLocale();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/80 dark:bg-black/80 backdrop-blur-lg border-t border-ink/10 dark:border-white/10 pb-[env(safe-area-inset-bottom)] sm:hidden">
      <div className="flex items-center justify-around h-14">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center justify-center gap-0.5 min-w-[44px] min-h-[44px] transition-colors ${
                isActive
                  ? "text-marine dark:text-blue-400"
                  : "text-ink/40 dark:text-white/40"
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-semibold leading-none">{label[locale]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
