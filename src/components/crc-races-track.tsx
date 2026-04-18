"use client";

import type { RacePlayer } from "@/lib/crc-races";
import { Zap, Swords, Shield, Forward } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

interface Props {
  players: RacePlayer[];
  trackLength: number;
  myAddress?: string | null;
  showActionBadges?: boolean; // during reveal/resolution
  isTarget?: (address: string) => boolean;
  onPickTarget?: (address: string) => void;
}

function shorten(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}

function ActionBadge({ effect }: { effect: RacePlayer["lastEffect"] }) {
  const { locale } = useLocale();
  const t = translations.crcRaces;
  if (!effect || effect === "idle") return null;
  const styles: Record<string, { bg: string; text: string; label: string; icon: React.ReactNode }> = {
    sprinted:         { bg: "bg-orange-500", text: "text-white", label: t.effSprint[locale], icon: <Zap className="w-3 h-3" /> },
    advanced:         { bg: "bg-emerald-500", text: "text-white", label: t.effAdvance[locale], icon: <Forward className="w-3 h-3" /> },
    sabotaged:        { bg: "bg-rose-500", text: "text-white", label: t.effSabotage[locale], icon: <Swords className="w-3 h-3" /> },
    shielded:         { bg: "bg-sky-500", text: "text-white", label: t.effShield[locale], icon: <Shield className="w-3 h-3" /> },
    blocked_sabotage: { bg: "bg-sky-600", text: "text-white", label: t.effBlocked[locale], icon: <Shield className="w-3 h-3" /> },
    took_sabotage:    { bg: "bg-rose-600", text: "text-white", label: t.effHit[locale], icon: <Swords className="w-3 h-3" /> },
  };
  const s = styles[effect];
  if (!s) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${s.bg} ${s.text} shadow`}>
      {s.icon} {s.label}
    </span>
  );
}

export function CrcRacesTrack({ players, trackLength, myAddress, showActionBadges, isTarget, onPickTarget }: Props) {
  const laneHeight = 52;
  const totalHeight = Math.max(players.length, 1) * laneHeight + 16;

  return (
    <div className="w-full rounded-2xl bg-gradient-to-b from-sky-200 via-emerald-100 to-emerald-200 dark:from-sky-950 dark:via-emerald-950 dark:to-emerald-900 border border-emerald-300/40 dark:border-emerald-800/40 p-3 overflow-hidden shadow-inner">
      <div className="relative" style={{ height: totalHeight }}>
        {/* Finish line */}
        <div
          className="absolute top-0 bottom-2 right-3 w-2 rounded-sm"
          style={{ backgroundImage: "repeating-linear-gradient(to bottom, #111 0 8px, #fff 8px 16px)" }}
        />
        <div className="absolute top-0 right-1 text-[9px] font-bold text-ink/70 dark:text-white/80 -rotate-90 origin-top-right tracking-widest">FINISH</div>

        {/* Start line */}
        <div className="absolute top-0 bottom-2 left-[88px] w-0.5 bg-ink/20 dark:bg-white/20" />

        {players.map((p, idx) => {
          const pct = Math.min(100, Math.max(0, (p.position / trackLength) * 100));
          const isMe = myAddress && p.address.toLowerCase() === myAddress.toLowerCase();
          const hasFinished = p.finishRank !== null;
          const targeted = isTarget?.(p.address) ?? false;
          const selectable = !!onPickTarget && !hasFinished && !isMe;

          return (
            <div
              key={p.address}
              onClick={selectable ? () => onPickTarget?.(p.address) : undefined}
              className={`relative ${selectable ? "cursor-pointer" : ""}`}
              style={{ height: laneHeight }}
            >
              {/* Lane bg stripes (alternating) */}
              <div className={`absolute inset-x-0 inset-y-1 rounded-lg ${idx % 2 === 0 ? "bg-white/20 dark:bg-white/5" : "bg-white/10 dark:bg-white/[0.02]"}`} />
              {/* Targeted overlay */}
              {targeted && (
                <div className="absolute inset-x-0 inset-y-1 rounded-lg ring-2 ring-rose-500 bg-rose-500/10" />
              )}

              {/* Dashed center line */}
              <div className="absolute top-1/2 left-[92px] right-6 h-0.5 border-t-2 border-dashed border-white/60 dark:border-white/30" />

              {/* Player label + energy */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[84px] pr-2 flex items-center gap-1">
                {p.circlesAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.circlesAvatar} alt="" className="w-5 h-5 rounded-full border border-white shadow-sm shrink-0" />
                ) : (
                  <span className="text-sm shrink-0">{p.horseEmoji}</span>
                )}
                <span className={`text-[10px] font-semibold truncate ${isMe ? "text-marine" : "text-ink/70 dark:text-white/80"}`}>
                  {p.circlesName || shorten(p.address)}
                </span>
              </div>

              {/* Track area */}
              <div className="absolute top-1/2 -translate-y-1/2 left-[92px] right-6">
                <div
                  className={`absolute top-1/2 -translate-y-1/2 transition-all duration-700 ease-out ${isMe ? "z-20" : "z-10"}`}
                  style={{ left: `${pct}%`, transform: "translate(-50%, -50%)" }}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    {showActionBadges && <ActionBadge effect={p.lastEffect} />}
                    <div className={`relative ${isMe ? "scale-110" : ""}`}>
                      {p.lastEffect === "sprinted" && (
                        <div className="absolute inset-0 -left-6 flex items-center pointer-events-none">
                          <div className="w-5 h-1 bg-gradient-to-l from-orange-500 to-transparent rounded-full" />
                        </div>
                      )}
                      {p.lastEffect === "shielded" || p.lastEffect === "blocked_sabotage" ? (
                        <div className="absolute inset-0 rounded-full ring-2 ring-sky-400 animate-pulse" style={{ padding: 4, inset: -4 }} />
                      ) : null}
                      {p.circlesAvatar ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.circlesAvatar} alt="" className="w-9 h-9 rounded-full border-2 border-white shadow-md object-cover" />
                      ) : (
                        <span className="text-3xl leading-none drop-shadow-md">{p.horseEmoji}</span>
                      )}
                      {hasFinished && (
                        <span className="absolute -top-2 -right-3 text-[9px] font-bold bg-yellow-400 text-yellow-900 px-1.5 py-0.5 rounded-full shadow ring-1 ring-yellow-600">
                          #{p.finishRank}
                        </span>
                      )}
                    </div>
                    {/* Energy pips */}
                    {!hasFinished && (
                      <div className="flex gap-0.5 mt-0.5">
                        {Array.from({ length: Math.max(0, Math.min(5, p.energy)) }).map((_, i) => (
                          <div key={i} className="w-1 h-1 rounded-full bg-amber-400 shadow-sm" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
