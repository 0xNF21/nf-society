"use client";

import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { GAME_REGISTRY } from "@/lib/game-registry";

interface GameRulesModalProps {
  gameKey: string;
}

export function GameRulesModal({ gameKey }: GameRulesModalProps) {
  const [open, setOpen] = useState(false);
  const { locale } = useLocale();
  const config = GAME_REGISTRY[gameKey];
  if (!config) return null;

  const t = translations[config.translationKey as keyof typeof translations] as Record<string, Record<string, string>> | undefined;
  if (!t?.rules) return null;

  const rules = t.rules[locale];
  if (!rules) return null;

  // Parse rules: split by newline, support "**bold**" and "- bullet"
  const lines = rules.split("\n").filter(l => l.trim());

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-ink/10 dark:border-white/10 bg-white/60 dark:bg-white/5 text-sm font-semibold text-ink/60 dark:text-white/60 hover:border-marine/40 hover:text-marine transition-all">
        <HelpCircle className="w-4 h-4" />
        {locale === "fr" ? "Règles du jeu" : "Game Rules"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}>
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-ink/10 dark:border-white/10 overflow-hidden"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink/5 dark:border-white/5">
              <div className="flex items-center gap-2">
                <span className="text-xl">{config.emoji}</span>
                <h2 className="text-base font-bold text-ink dark:text-white">
                  {locale === "fr" ? "Règles du jeu" : "Game Rules"}
                </h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-ink/40 hover:text-ink transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Rules content */}
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-2">
              {lines.map((line, i) => {
                const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("• ");
                const text = isBullet ? line.trim().slice(2) : line.trim();

                // Bold markers
                const parts = text.split(/\*\*(.*?)\*\*/g);
                const rendered = parts.map((part, j) =>
                  j % 2 === 1
                    ? <strong key={j} className="font-bold text-ink dark:text-white">{part}</strong>
                    : <span key={j}>{part}</span>
                );

                if (isBullet) {
                  return (
                    <div key={i} className="flex gap-2 text-sm text-ink/70 dark:text-white/70">
                      <span className="text-marine shrink-0">•</span>
                      <p>{rendered}</p>
                    </div>
                  );
                }

                return (
                  <p key={i} className="text-sm text-ink/70 dark:text-white/70">{rendered}</p>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
