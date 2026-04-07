"use client";
import { useState } from "react";
import { GameLobby } from "@/components/game-lobby";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

export default function MemoryLobby() {
  const [difficulty, setDifficulty] = useState("medium");
  const { locale } = useLocale();
  const t = translations.memory;

  return (
    <GameLobby
      gameKey="memory"
      extraCreateFields={
        <div>
          <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">
            {t.difficulty[locale]}
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(["easy", "medium", "hard"] as const).map((d) => (
              <button key={d} onClick={() => setDifficulty(d)}
                className={`py-2.5 rounded-xl text-xs font-bold border transition-all ${
                  difficulty === d
                    ? "bg-marine text-white border-marine"
                    : "bg-white/80 text-ink/60 border-ink/10 hover:border-marine/40"
                }`}>
                <span className="block">{t[d][locale]}</span>
                <span className="block text-[10px] opacity-60">{t[`${d}Desc`][locale]}</span>
              </button>
            ))}
          </div>
        </div>
      }
      getExtraBody={() => ({ difficulty })}
      getDemoSlug={() => `DEMO-${difficulty}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`}
    />
  );
}
