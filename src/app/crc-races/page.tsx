"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Lock, Globe, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { GAME_REGISTRY } from "@/lib/game-registry";
import { GameRulesModal } from "@/components/game-rules-modal";
import { TIER_LIST, TIER_BETS, MIN_PLAYERS, MAX_PLAYERS, type RaceTier } from "@/lib/crc-races";

type LobbyRoom = {
  slug: string;
  tier: RaceTier;
  betCrc: number;
  maxPlayers: number;
  players: unknown[];
  createdAt: string;
};

export default function CrcRacesLobbyPage() {
  const router = useRouter();
  const { locale } = useLocale();
  const { isDemo } = useDemo();
  const t = translations.crcRaces;
  const te = translations.errors;
  const config = GAME_REGISTRY["crc-races"];

  const [tier, setTier] = useState<RaceTier>("bronze");
  const [maxPlayers, setMaxPlayers] = useState<number>(4);
  const [joinSlug, setJoinSlug] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [rooms, setRooms] = useState<LobbyRoom[]>([]);

  useEffect(() => {
    if (isDemo) return;
    let active = true;
    async function loadRooms() {
      try {
        const res = await fetch("/api/crc-races");
        if (!res.ok) return;
        const data = await res.json();
        if (active) setRooms(data.rooms || []);
      } catch {}
    }
    loadRooms();
    const id = setInterval(loadRooms, 5000);
    return () => { active = false; clearInterval(id); };
  }, [isDemo]);

  async function createGame() {
    if (isDemo) {
      const demoSlug = `DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      router.push(`/crc-races/${demoSlug}?maxPlayers=${maxPlayers}&tier=${tier}`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/crc-races", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, maxPlayers, isPrivate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const slug = data.slug || data.game?.slug;
      sessionStorage.setItem(`crc-races_creator_${slug}`, "1");
      router.push(`/crc-races/${slug}`);
    } catch {
      setError(te.gameCreate[locale]);
    } finally {
      setLoading(false);
    }
  }

  function joinGame() {
    const s = joinSlug.trim().toUpperCase();
    if (s.length < 6) return;
    router.push(`/crc-races/${s}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-start px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/multijoueur" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>

        <div className="text-center mb-10">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${config.iconBg} mb-4`}>
            <span className="text-3xl">{config.emoji}</span>
          </div>
          <h1 className="text-3xl font-bold text-ink mb-2">{t.title[locale]}</h1>
          <p className="text-ink/50 text-sm">{t.subtitle[locale]}</p>
          <div className="mt-3 flex justify-center">
            <GameRulesModal gameKey="crc-races" />
          </div>
        </div>

        {/* Create race */}
        <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-ink">{t.createGame[locale]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Tier */}
            <div>
              <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">
                {t.tier[locale]}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {TIER_LIST.map((ti) => {
                  const key = `tier${ti.charAt(0).toUpperCase()}${ti.slice(1)}` as keyof typeof t;
                  const label = (t[key] as { fr: string; en: string } | undefined)?.[locale] || ti;
                  return (
                    <button key={ti} onClick={() => setTier(ti)}
                      className={`min-h-[44px] py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95 ${
                        tier === ti
                          ? "bg-marine text-white border-marine"
                          : "bg-white/80 text-ink/60 border-ink/10 hover:border-marine/40"
                      }`}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Max players */}
            <div>
              <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">
                {t.maxPlayers[locale]}
              </label>
              <div className="flex items-center gap-3">
                {[2, 3, 4, 5, 6, 8].filter((n) => n >= MIN_PLAYERS && n <= MAX_PLAYERS).map((n) => (
                  <button key={n} onClick={() => setMaxPlayers(n)}
                    className={`flex-1 min-h-[44px] py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95 ${
                      maxPlayers === n
                        ? "bg-marine text-white border-marine"
                        : "bg-white/80 text-ink/60 border-ink/10 hover:border-marine/40"
                    }`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Private toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-ink/[0.03] border border-ink/5">
              <div className="flex items-center gap-2">
                {isPrivate ? <Lock className="w-4 h-4 text-ink/40" /> : <Globe className="w-4 h-4 text-ink/40" />}
                <span className="text-xs font-semibold text-ink/60">
                  {isPrivate
                    ? t.privateRace[locale]
                    : t.publicRace[locale]}
                </span>
              </div>
              <button onClick={() => setIsPrivate(!isPrivate)}
                className={`relative w-10 h-5 rounded-full transition-colors ${isPrivate ? "bg-marine" : "bg-ink/20"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isPrivate ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>

            {/* Pot info */}
            <div className="p-3 rounded-xl bg-ink/[0.03] border border-ink/5 text-xs text-ink/50">
              🏆 {t.potTotal[locale]}: <span className="font-bold text-ink">{TIER_BETS[tier] * maxPlayers} CRC</span>
              <span className="ml-1">{t.commission[locale]}</span>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button onClick={createGame} disabled={loading} className="w-full rounded-xl font-bold"
              style={{ background: config.accentColor }}>
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> {t.creating[locale]}</>
                : `${t.createBtn[locale]} — ${TIER_BETS[tier]} CRC`}
            </Button>
          </CardContent>
        </Card>

        {/* Open races */}
        {!isDemo && (
          <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-ink">{t.openRaces[locale]}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rooms.length === 0 && (
                <p className="text-xs text-ink/40 text-center py-4">{t.noOpenRaces[locale]}</p>
              )}
              {rooms.map((r) => {
                const count = Array.isArray(r.players) ? r.players.length : 0;
                return (
                  <button key={r.slug} onClick={() => router.push(`/crc-races/${r.slug}`)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-xl bg-white/80 border border-ink/10 hover:border-marine/40 transition-colors">
                    <span className="text-sm font-mono font-bold text-ink">{r.slug}</span>
                    <span className="text-xs text-ink/50">
                      {r.betCrc} CRC · <Users className="inline w-3 h-3" /> {count}/{r.maxPlayers}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Join by code */}
        <Card className="bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-ink">{t.joinGame[locale]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">
                {t.gameCode[locale]}
              </label>
              <input type="text" placeholder="Ex: X7K2PQ" value={joinSlug}
                onChange={(e) => setJoinSlug(e.target.value.toUpperCase())} maxLength={6}
                className="w-full px-4 py-3 rounded-xl border border-ink/10 bg-white/80 text-ink text-center text-xl font-mono font-bold tracking-[0.3em] focus:outline-none focus:border-marine/40 uppercase"
              />
            </div>
            <Button onClick={joinGame} disabled={joinSlug.trim().length < 6} variant="outline"
              className="w-full rounded-xl font-bold border-ink/20 hover:border-marine/40">
              {t.join[locale]}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
