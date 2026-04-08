"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { RotateCcw, ArrowRight } from "lucide-react";

const t = translations.rematch;

type RematchButtonProps = {
  gameKey: string;
  slug: string;
  rematchSlug: string | null;
};

export function RematchButton({ gameKey, slug, rematchSlug }: RematchButtonProps) {
  const { locale } = useLocale();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // If a rematch already exists, show join link
  if (rematchSlug) {
    return (
      <button
        onClick={() => router.push(`/${gameKey}/${rematchSlug}`)}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-white bg-marine hover:bg-marine/90 transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        {t.join[locale]}
      </button>
    );
  }

  const handleRematch = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/rematch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameKey, slug }),
      });
      const data = await res.json();

      if (res.status === 409 && data.rematchSlug) {
        // Rematch already exists (race condition), just redirect
        router.push(`/${gameKey}/${data.rematchSlug}`);
        return;
      }

      if (!res.ok) {
        setError(data.error || "Error");
        setCreating(false);
        return;
      }

      // Redirect to the new rematch game
      router.push(`/${gameKey}/${data.rematchSlug}`);
    } catch {
      setError("Network error");
      setCreating(false);
    }
  };

  return (
    <div className="space-y-1">
      <button
        onClick={handleRematch}
        disabled={creating}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-white bg-citrus hover:bg-citrus/90 transition-colors disabled:opacity-50"
      >
        <RotateCcw className={`w-4 h-4 ${creating ? "animate-spin" : ""}`} />
        {creating ? t.creating[locale] : t.btn[locale]}
      </button>
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
    </div>
  );
}

/**
 * Shown to the opponent when a rematch is detected via polling.
 */
export function RematchBanner({ gameKey, rematchSlug }: { gameKey: string; rematchSlug: string }) {
  const { locale } = useLocale();
  const router = useRouter();

  return (
    <div
      onClick={() => router.push(`/${gameKey}/${rematchSlug}`)}
      className="flex items-center justify-between gap-3 py-3 px-4 rounded-xl bg-citrus/10 border border-citrus/30 cursor-pointer hover:bg-citrus/20 transition-colors"
    >
      <div className="flex items-center gap-2">
        <RotateCcw className="w-4 h-4 text-citrus" />
        <span className="font-bold text-sm text-ink">{t.proposed[locale]}</span>
      </div>
      <div className="flex items-center gap-1 text-sm font-bold text-citrus">
        {t.join[locale]}
        <ArrowRight className="w-3 h-3" />
      </div>
    </div>
  );
}
