"use client";

import { useState } from "react";
import { GameLobby } from "@/components/game-lobby";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

export default function PfcLobby() {
  const [bestOf, setBestOf] = useState<3 | 5>(3);
  const { locale } = useLocale();
  const t = translations.pfc;

  return (
    <GameLobby
      gameKey="pfc"
      extraCreateFields={
        <div>
          <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">
            {t.format[locale]}
          </label>
          <div className="grid grid-cols-2 gap-2">
            {([3, 5] as const).map((n) => (
              <button key={n} onClick={() => setBestOf(n)}
                className={`py-2.5 rounded-xl text-sm font-bold border transition-all ${
                  bestOf === n
                    ? "bg-marine text-white border-marine"
                    : "bg-white/80 text-ink/60 border-ink/10 hover:border-marine/40"
                }`}>
                {n === 3 ? t.bestOf3[locale] : t.bestOf5[locale]}
              </button>
            ))}
          </div>
        </div>
      }
      getExtraBody={() => ({ bestOf })}
      getDemoSlug={() => `DEMO-bo${bestOf}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`}
    />
  );
}
