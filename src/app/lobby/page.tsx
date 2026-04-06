"use client";
import { useEffect, useState, useCallback } from "react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import Link from "next/link";
import { ArrowLeft, RefreshCw, Users, Clock, Swords, Brain, Ship, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Room {
  slug: string;
  betCrc: number;
  commissionPct: number;
  createdAt: string;
  game: "morpion" | "dames" | "relics" | "memory";
}

const GAME_INFO: Record<string, { label_fr: string; label_en: string; icon: React.ReactNode; color: string; href: string }> = {
  morpion: { label_fr: "Morpion", label_en: "Tic-Tac-Toe", icon: <Grid3X3 className="w-5 h-5" />, color: "text-blue-500", href: "/morpion" },
  dames: { label_fr: "Dames", label_en: "Checkers", icon: <Swords className="w-5 h-5" />, color: "text-amber-500", href: "/dames" },
  relics: { label_fr: "Bataille Navale", label_en: "Naval Battle", icon: <Ship className="w-5 h-5" />, color: "text-emerald-500", href: "/relics" },
  memory: { label_fr: "Memory", label_en: "Memory", icon: <Brain className="w-5 h-5" />, color: "text-pink-500", href: "/memory" },
};

function timeAgo(dateStr: string, locale: "fr" | "en") {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return locale === "fr" ? "à l'instant" : "just now";
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return locale === "fr" ? `il y a ${m}min` : `${m}m ago`;
  }
  const h = Math.floor(diff / 3600);
  return locale === "fr" ? `il y a ${h}h` : `${h}h ago`;
}

export default function LobbyPage() {
  const { locale } = useLocale();
  const { isDark } = useTheme();
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
            <ArrowLeft className="w-4 h-4" /> {locale === "fr" ? "Accueil" : "Home"}
          </Link>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                <Users className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-ink dark:text-white">
                  {locale === "fr" ? "Lobby" : "Lobby"}
                </h1>
                <p className="text-xs text-ink/50 dark:text-white/50">
                  {locale === "fr" ? "Rejoins une partie ouverte" : "Join an open game"}
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
            { key: "all", label_fr: "Tous", label_en: "All" },
            { key: "morpion", label_fr: "Morpion", label_en: "Tic-Tac-Toe" },
            { key: "dames", label_fr: "Dames", label_en: "Checkers" },
            { key: "relics", label_fr: "Bataille", label_en: "Naval" },
            { key: "memory", label_fr: "Memory", label_en: "Memory" },
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
              {locale === "fr" ? f.label_fr : f.label_en}
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
                {locale === "fr" ? "Aucune partie en attente" : "No games waiting"}
              </p>
              <p className="text-xs text-ink/30 dark:text-white/30 mt-1">
                {locale === "fr" ? "Crée une partie pour commencer !" : "Create a game to get started!"}
              </p>
            </CardContent>
          </Card>
        )}

        {!loading && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((room) => {
              const info = GAME_INFO[room.game];
              const winAmount = room.betCrc * 2 * (1 - room.commissionPct / 100);
              return (
                <Link key={`${room.game}-${room.slug}`} href={`${info.href}/${room.slug}`}>
                  <Card className={`rounded-2xl border-0 shadow-sm hover:shadow-md transition-all cursor-pointer ${
                    isDark ? "bg-white/5 hover:bg-white/10" : "bg-white/60 hover:bg-white/80"
                  } backdrop-blur-sm mb-2`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        {/* Game icon */}
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                          isDark ? "bg-white/10" : "bg-ink/[0.05]"
                        } ${info.color}`}>
                          {info.icon}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${info.color}`}>
                              {locale === "fr" ? info.label_fr : info.label_en}
                            </span>
                            <span className="text-[10px] font-mono text-ink/30 dark:text-white/30">
                              {room.slug}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-ink/50 dark:text-white/50">
                              {locale === "fr" ? "Mise" : "Bet"}: <span className="font-bold text-ink dark:text-white">{room.betCrc} CRC</span>
                            </span>
                            <span className="text-[10px] text-ink/30 dark:text-white/30">
                              → {winAmount} CRC
                            </span>
                          </div>
                        </div>

                        {/* Time + Join */}
                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-[10px] text-ink/30 dark:text-white/30 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {timeAgo(room.createdAt, locale)}
                          </span>
                          <span className="text-[10px] font-bold text-marine dark:text-blue-400 bg-marine/10 dark:bg-blue-400/10 px-2 py-0.5 rounded-full">
                            {locale === "fr" ? "Rejoindre" : "Join"}
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
            {locale === "fr" ? "Ou crée ta partie" : "Or create your game"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(GAME_INFO).map(([key, info]) => (
              <Link key={key} href={info.href}>
                <Card className={`rounded-xl border-0 shadow-sm hover:shadow-md transition-all cursor-pointer ${
                  isDark ? "bg-white/5 hover:bg-white/10" : "bg-white/60 hover:bg-white/80"
                } backdrop-blur-sm`}>
                  <CardContent className="p-3 flex items-center gap-2">
                    <span className={info.color}>{info.icon}</span>
                    <span className="text-xs font-bold text-ink dark:text-white">
                      {locale === "fr" ? info.label_fr : info.label_en}
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
