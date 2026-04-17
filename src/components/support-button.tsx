"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useFeatureFlags } from "@/components/feature-flag-provider";
import { translations } from "@/lib/i18n";

const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "";

// Cle localStorage ou on stocke la derniere adresse wallet vue (ecrite apres
// chaque paiement Circles reussi, cf. miniapp-provider ou hooks de jeu).
// Pour l'instant on essaie plusieurs cles connues en fallback.
function readLastWallet(): string | null {
  if (typeof window === "undefined") return null;
  const candidates = [
    "nfsociety-last-wallet",
    "circles-wallet-address",
  ];
  for (const k of candidates) {
    const v = localStorage.getItem(k);
    if (v && v.startsWith("0x")) return v;
  }
  return null;
}

function toBase64Url(input: string): string {
  return btoa(input)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export default function SupportButton() {
  const { locale } = useLocale();
  const { isEnabled, loading } = useFeatureFlags();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const t = translations.support;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Ne rend rien tant que le client n'est pas hydrate (evite mismatch SSR).
  if (!mounted) return null;

  // Masque si bot username non configure ou feature flag desactive.
  if (!BOT_USERNAME) return null;
  if (!loading && !isEnabled("support")) return null;

  const handleClick = () => {
    const wallet = readLastWallet();
    const ctx: { page?: string; wallet?: string } = {};
    if (pathname) ctx.page = pathname;
    if (wallet) ctx.wallet = wallet;

    const hasCtx = !!(ctx.page || ctx.wallet);
    const url = hasCtx
      ? `https://t.me/${BOT_USERNAME}?start=${toBase64Url(JSON.stringify(ctx))}`
      : `https://t.me/${BOT_USERNAME}`;

    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={t.buttonTooltip[locale]}
      title={t.buttonTooltip[locale]}
      className="fixed z-40 right-4 bottom-20 sm:bottom-6 h-12 w-12 rounded-full shadow-lg bg-marine text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-transform ring-2 ring-white/20 dark:ring-white/10"
    >
      <MessageCircle className="h-5 w-5" />
    </button>
  );
}
