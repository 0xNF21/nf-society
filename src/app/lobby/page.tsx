"use client";
import { useEffect, useState, useCallback } from "react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GAME_REGISTRY, GAME_LABELS } from "@/lib/game-registry";
import { translations } from "@/lib/i18n";
import { formatCrc } from "@/lib/format";

interface Room {
  slug: string;
  betCrc: number;
  commissionPct: number;
  createdAt: string;
  game: string;
}

function timeAgo(dateStr: string, locale: "fr" | "en") {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  const t = translations.lobby;
  if (diff < 60) return t.justNow[locale];
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return t.minAgo[locale].replace("{n}", String(m));
  }
  const h = Math.floor(diff / 3600);
  return t.hourAgo[locale].replace("{n}", String(h));
}

export default function LobbyPage() {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const t = translations.lobby;
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");

  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch("/api/lobby");
      const data = await res.json();
      setRooms(data.rooms || []);
    } catch {
      console.error("Failed to fetch lobby");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
    const interval = setInterval(fetchRooms, 10000);
    return () => clearInterval(interval);
  }, [fetchRooms]);

  const filtered = filter === "all" ? rooms : rooms.filter((r) => r.game === filter);

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="mb-6 space-y-2">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.home[locale]}
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-ink dark:text-white">
                  {t.title[locale]}
                </h1>
                <p className="text-xs text-ink/50 dark:text-white/50">
                  {t.subtitle[locale]}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setLoading(true); fetchRooms(); }}
              className="rounded-xl text-ink/40 dark:text-white/40">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {[
            { key: "all", label: { fr: "Tous", en: "All" } },
            ...Object.values(GAME_REGISTRY).map((g) => ({
              key: g.key,
              label: { fr: GAME_LABELS[g.key] || g.key, en: GAME_LABELS[g.key] || g.key },
            })),
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all border ${
                filter === f.key
                  ? "bg-marine text-white border-marine"
                  : `border-ink/15 dark:border-white/15 text-ink/50 dark:text-white/50 hover:border-ink/30 dark:hover:border-white/30`
              }`}
            >
              {f.label[locale]}
            </button>
          ))}
        </div>

        {/* Room list */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`h-20 rounded-2xl animate-pulse ${isDark ? "bg-white/5" : "bg-ink/[0.05]"}`} />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <Card className={`rounded-2xl border-0 shadow-sm ${isDark ? "bg-white/5" : "bg-white/60"} backdrop-blur-sm`}>
            <CardContent className="py-12 text-center">
              <Users className="w-10 h-10 mx-auto mb-3 text-ink/20 dark:text-white/20" />
              <p className="text-sm font-semibold text-ink/50 dark:text-white/50">
                {t.noGamesWaiting[locale]}
              </p>
              <p className="text-xs text-ink/30 dark:text-white/30 mt-1">
                {t.createToStart[locale]}
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((room) => {
              const reg = GAME_REGISTRY[room.game];
              const info = reg
                ? { label: GAME_LABELS[room.game] || room.game, emoji: reg.emoji, color: reg.iconColor }
                : { label: room.game, emoji: "🎮", color: "text-ink/50" };
              const winAmount = room.betCrc * 2 * (1 - room.commissionPct / 100);
              return (
                <Link key={`${room.game}-${room.slug}`} href={`/${room.game}/${room.slug}`}>
                  <Card className={`rounded-2xl border-0 shadow-sm hover:shadow-md transition-all cursor-pointer ${
                    isDark ? "bg-white/5 hover:bg-white/10" : "bg-white/60 hover:bg-white/80"
                  } backdrop-blur-sm mb-2`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        {/* Game icon */}
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${
                          isDark ? "bg-white/10" : "bg-ink/[0.05]"
                        }`}>
                          {info.emoji}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${info.color}`}>
                              {info.label}
                            </span>
                            <span className="text-[10px] font-mono text-ink/30 dark:text-white/30">
                              {room.slug}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-ink/50 dark:text-white/50">
                              {t.betLabel[locale]}: <span className="font-bold text-ink dark:text-white">{room.betCrc} CRC</span>
                            </span>
                            <span className="text-[10px] text-ink/30 dark:text-white/30">
                              → {formatCrc(winAmount)} CRC
                            </span>
                          </div>
                        </div>

                        {/* Time + Join */}
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-[10px] text-ink/30 dark:text-white/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {timeAgo(room.createdAt, locale)}
                          </span>
                          <span className="text-[10px] font-bold text-marine dark:text-blue-400 bg-marine/10 dark:bg-blue-400/10 px-2 py-0.5 rounded-full">
                            {t.joinBtn[locale]}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}

        {/* Quick create buttons */}
        <div className="mt-8">
          <p className="text-xs font-semibold text-ink/40 dark:text-white/40 uppercase tracking-widest mb-3">
            {t.orCreateGame[locale]}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(GAME_REGISTRY).map((g) => (
              <Link key={g.key} href={`/${g.key}`}>
                <Card className={`rounded-xl border-0 shadow-sm hover:shadow-md transition-all cursor-pointer ${
                  isDark ? "bg-white/5 hover:bg-white/10" : "bg-white/60 hover:bg-white/80"
                } backdrop-blur-sm`}>
                  <CardContent className="p-3 flex items-center gap-2">
                    <span className="text-lg">{g.emoji}</span>
                    <span className="text-xs font-bold text-ink dark:text-white">
                      {GAME_LABELS[g.key] || g.key}
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
