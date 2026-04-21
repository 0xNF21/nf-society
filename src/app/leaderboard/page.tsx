"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BackLink } from "@/components/back-link";
import { ArrowLeft, Trophy, Medal, Crown, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { ALL_GAMES, GAME_LABELS } from "@/lib/game-registry";

interface LeaderboardEntry {
  rank: number;
  address: string;
  xp: number;
  level: number;
  wins?: number;
  losses?: number;
  gamesPlayed?: number;
  winRate?: number;
  crcWon?: number;
  value: number;
  label: string;
}

const TYPES = [
  { key: "xp", label_fr: "XP", label_en: "XP", emoji: "⭐" },
  { key: "wins", label_fr: "Victoires", label_en: "Wins", emoji: "🏆" },
  { key: "winrate", label_fr: "Win Rate", label_en: "Win Rate", emoji: "📊" },
  { key: "crc", label_fr: "CRC Gagnes", label_en: "CRC Won", emoji: "💰" },
];

const PERIODS = [
  { key: "all", label_fr: "Tout", label_en: "All Time" },
  { key: "month", label_fr: "Ce mois", label_en: "This Month" },
  { key: "week", label_fr: "Semaine", label_en: "This Week" },
];

const RANK_STYLES: Record<number, { bg: string; border: string; text: string; icon: typeof Crown }> = {
  1: { bg: "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/30 dark:to-yellow-900/30", border: "border-amber-300", text: "text-amber-600", icon: Crown },
  2: { bg: "bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800/30 dark:to-gray-800/30", border: "border-slate-300", text: "text-slate-500", icon: Medal },
  3: { bg: "bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20", border: "border-orange-300", text: "text-orange-600", icon: Medal },
};

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LeaderboardPage() {
  const { locale } = useLocale();
  const t = translations.leaderboard;
  const [type, setType] = useState("xp");
  const [period, setPeriod] = useState("all");
  const [game, setGame] = useState("all");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, { name: string; imageUrl: string | null }>>({});

  const fetchLeaderboard = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type, period, game });
      const res = await fetch(`/api/leaderboard?${params}`);
      const data = await res.json();
      setEntries(data.entries || []);

      // Fetch profiles for top players
      const addresses = (data.entries || []).slice(0, 20).map((e: LeaderboardEntry) => e.address);
      if (addresses.length > 0) {
        const pRes = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses }),
        });
        const pData = await pRes.json();
        if (pData.profiles) setProfiles(prev => ({ ...prev, ...pData.profiles }));
      }
    } catch {}
    setLoading(false);
  }, [type, period, game]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  // Check if current user is in leaderboard
  let myAddress: string | null = null;
  try {
    const raw = localStorage.getItem("nfs_profile");
    if (raw) myAddress = JSON.parse(raw).address?.toLowerCase();
  } catch {}

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="space-y-2">
          <BackLink fallback="/home" className="inline-flex items-center gap-1.5 text-sm text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
          </BackLink>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow">
              <Trophy className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-ink dark:text-white">{t.title[locale]}</h1>
              <p className="text-xs text-ink/50 dark:text-white/50">{t.subtitle[locale]}</p>
            </div>
          </div>
        </div>

        {/* Type filter */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {TYPES.map(tp => (
            <button key={tp.key} onClick={() => setType(tp.key)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all ${
                type === tp.key ? "bg-marine text-white border-marine" : "border-ink/10 dark:border-white/10 text-ink/50 dark:text-white/50 hover:border-ink/30"
              }`}>
              <span>{tp.emoji}</span>
              {locale === "fr" ? tp.label_fr : tp.label_en}
            </button>
          ))}
        </div>

        {/* Period + Game filters */}
        {type !== "xp" && (
          <div className="flex gap-2">
            <div className="flex gap-1 flex-1">
              {PERIODS.map(p => (
                <button key={p.key} onClick={() => setPeriod(p.key)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                    period === p.key ? "bg-ink/10 dark:bg-white/10 border-ink/20 text-ink dark:text-white" : "border-ink/5 text-ink/40"
                  }`}>
                  {locale === "fr" ? p.label_fr : p.label_en}
                </button>
              ))}
            </div>
            <select value={game} onChange={e => setGame(e.target.value)}
              className="px-2 py-1.5 rounded-lg border border-ink/10 text-[10px] font-bold bg-white dark:bg-white/10">
              <option value="all">{locale === "fr" ? "Tous les jeux" : "All games"}</option>
              {ALL_GAMES.map(g => (
                <option key={g.key} value={g.key}>{GAME_LABELS[g.key]}</option>
              ))}
            </select>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <RefreshCw className="w-6 h-6 animate-spin text-ink/20" />
          </div>
        )}

        {/* Empty */}
        {!loading && entries.length === 0 && (
          <Card className="rounded-2xl border-0 shadow-sm bg-white/60 dark:bg-white/5">
            <CardContent className="py-12 text-center">
              <Trophy className="w-10 h-10 mx-auto mb-3 text-ink/20" />
              <p className="text-sm text-ink/50">{t.empty[locale]}</p>
            </CardContent>
          </Card>
        )}

        {/* Leaderboard list */}
        {!loading && entries.length > 0 && (
          <div className="space-y-2">
            {entries.map((entry) => {
              const isTop3 = entry.rank <= 3;
              const style = RANK_STYLES[entry.rank];
              const profile = profiles[entry.address.toLowerCase()];
              const name = profile?.name || shortenAddress(entry.address);
              const isMe = myAddress === entry.address.toLowerCase();

              return (
                <Link key={entry.address} href={`/player/${entry.address}`}>
                  <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all hover:shadow-md mb-1 ${
                    isTop3 && style
                      ? `${style.bg} border-2 ${style.border}`
                      : isMe
                        ? "bg-marine/5 border-2 border-marine/30"
                        : "bg-white/60 dark:bg-white/5 border border-ink/5 hover:bg-white/80 dark:hover:bg-white/10"
                  }`}>
                    {/* Rank */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${
                      isTop3 && style ? `${style.text}` : "text-ink/30 dark:text-white/30"
                    }`}>
                      {isTop3 && style ? <style.icon className="w-5 h-5" /> : entry.rank}
                    </div>

                    {/* Avatar */}
                    {profile?.imageUrl ? (
                      <img src={profile.imageUrl} alt={name} className="w-9 h-9 rounded-full object-cover border border-white/20 shadow-sm" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-marine/10 flex items-center justify-center text-xs font-black text-marine">
                        {name.slice(0, 2).toUpperCase()}
                      </div>
                    )}

                    {/* Name + level */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${isMe ? "text-marine" : "text-ink dark:text-white"}`}>
                        {name} {isMe && <span className="text-[10px] text-marine/60">({locale === "fr" ? "vous" : "you"})</span>}
                      </p>
                      <p className="text-[10px] text-ink/40">Lv.{entry.level}</p>
                    </div>

                    {/* Value */}
                    <div className="text-right">
                      <p className={`text-sm font-black ${isTop3 && style ? style.text : "text-ink dark:text-white"}`}>
                        {entry.label}
                      </p>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
