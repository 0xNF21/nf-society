"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Lock, Globe } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { GAME_REGISTRY } from "@/lib/game-registry";
import { GameRulesModal } from "@/components/game-rules-modal";

interface GameLobbyProps {
  gameKey: string;
  /** Extra form fields between bet selector and private toggle (e.g. difficulty for memory) */
  extraCreateFields?: React.ReactNode;
  /** Extra body fields to include in POST request */
  getExtraBody?: () => Record<string, unknown>;
  /** Custom demo slug generator (default: DEMO-XXXXXX) */
  getDemoSlug?: () => string;
  /** Back link destination (default: "/multijoueur") */
  backHref?: string;
}

export function GameLobby({
  gameKey,
  extraCreateFields,
  getExtraBody,
  getDemoSlug,
  backHref = "/multijoueur",
}: GameLobbyProps) {
  const router = useRouter();
  const { locale } = useLocale();
  const { isDemo } = useDemo();
  const config = GAME_REGISTRY[gameKey];
  const t = translations[config.translationKey as keyof typeof translations] as Record<string, Record<string, string>>;
  const te = translations.errors;

  const [betCrc, setBetCrc] = useState(10);
  const [joinSlug, setJoinSlug] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createGame() {
    if (isDemo) {
      const demoSlug = getDemoSlug
        ? getDemoSlug()
        : `DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      router.push(`/${gameKey}/${demoSlug}`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const body: Record<string, unknown> = { betCrc, isPrivate };
      if (getExtraBody) Object.assign(body, getExtraBody());

      const res = await fetch(config.apiRoute, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Normalize: some APIs return { slug }, others { id: slug }
      const slug = data.slug || data.id;
      sessionStorage.setItem(`${gameKey}_creator_${slug}`, "1");
      router.push(`/${gameKey}/${slug}`);
    } catch {
      setError(te.gameCreate[locale]);
    } finally {
      setLoading(false);
    }
  }

  function joinGame() {
    const s = joinSlug.trim().toUpperCase();
    if (s.length < 6) return;
    router.push(`/${gameKey}/${s}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Back */}
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${config.iconBg} mb-4`}>
            <span className="text-3xl">{config.emoji}</span>
          </div>
          <h1 className="text-3xl font-bold text-ink mb-2">{t.title[locale]}</h1>
          <p className="text-ink/50 text-sm">{t.subtitle[locale]}</p>
          <div className="mt-3 flex justify-center">
            <GameRulesModal gameKey={gameKey} />
          </div>
        </div>

        {/* Create game */}
        <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-ink">{t.createGame[locale]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Bet selector */}
            <div>
              <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">
                {t.betPerPlayer[locale]}
              </label>
              <div className="flex items-center gap-3">
                {[5, 10, 25, 50].map((v) => (
                  <button key={v} onClick={() => setBetCrc(v)}
                    className={`flex-1 min-h-[44px] py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95 ${
                      betCrc === v
                        ? "bg-marine text-white border-marine"
                        : "bg-white/80 text-ink/60 border-ink/10 hover:border-marine/40"
                    }`}>
                    {v}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min={1} value={betCrc}
                  onChange={(e) => setBetCrc(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 px-3 py-2 rounded-xl border border-ink/10 bg-white/80 text-ink text-sm font-bold focus:outline-none focus:border-marine/40"
                />
                <span className="text-sm text-ink/50 leading-none">{t.crcPerPlayer[locale]}</span>
              </div>
            </div>

            {/* Game-specific extra fields (e.g. difficulty) */}
            {extraCreateFields}

            {/* Private toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-ink/[0.03] border border-ink/5">
              <div className="flex items-center gap-2">
                {isPrivate ? <Lock className="w-4 h-4 text-ink/40" /> : <Globe className="w-4 h-4 text-ink/40" />}
                <span className="text-xs font-semibold text-ink/60">
                  {isPrivate
                    ? (locale === "fr" ? "Partie privée" : "Private game")
                    : (locale === "fr" ? "Partie publique" : "Public game")}
                </span>
              </div>
              <button onClick={() => setIsPrivate(!isPrivate)}
                className={`relative w-10 h-5 rounded-full transition-colors ${isPrivate ? "bg-marine" : "bg-ink/20"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isPrivate ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>

            {/* Winner gets */}
            <div className="p-3 rounded-xl bg-ink/[0.03] border border-ink/5 text-xs text-ink/50">
              🏆 {t.winnerGets[locale]} <span className="font-bold text-ink">{betCrc * 2 * 0.95} CRC</span>
              <span className="ml-1">{t.commission[locale]}</span>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button onClick={createGame} disabled={loading} className="w-full rounded-xl font-bold"
              style={{ background: config.accentColor }}>
              {loading
                ? <><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> {t.creating[locale]}</>
                : `${t.createBtn[locale]} — ${betCrc} CRC`}
            </Button>
          </CardContent>
        </Card>

        {/* Join game */}
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
