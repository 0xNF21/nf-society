"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft, Brain, Loader2, Lock, Globe } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";

const DIFFICULTIES = [
  { value: "easy", pairs: 6, grid: "3×4" },
  { value: "medium", pairs: 8, grid: "4×4" },
  { value: "hard", pairs: 12, grid: "4×6" },
] as const;

export default function MemoryLobby() {
  const router = useRouter();
  const { locale } = useLocale();
  const { isDemo } = useDemo();
  const t = translations.memory;
  const te = translations.errors;
  const [betCrc, setBetCrc] = useState(10);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [joinSlug, setJoinSlug] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createGame() {
    if (isDemo) {
      router.push(`/memory/DEMO-${difficulty}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCrc, difficulty, isPrivate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem(`memory_creator_${data.slug}`, "1");
      router.push(`/memory/${data.slug}`);
    } catch {
      setError(te.gameCreate[locale]);
    } finally {
      setLoading(false);
    }
  }

  function joinGame() {
    const s = joinSlug.trim().toUpperCase();
    if (s.length < 6) return;
    router.push(`/memory/${s}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        <Link href="/multijoueur" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>

        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-pink-500/10 mb-4">
            <Brain className="w-8 h-8 text-pink-500" />
          </div>
          <h1 className="text-3xl font-bold text-ink mb-2">{t.title[locale]}</h1>
          <p className="text-ink/50 text-sm">{t.subtitle[locale]}</p>
        </div>

        <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-ink">{t.createGame[locale]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Difficulty */}
            <div>
              <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">{t.difficulty[locale]}</label>
              <div className="flex items-center gap-2">
                {DIFFICULTIES.map((d) => (
                  <button key={d.value} onClick={() => setDifficulty(d.value)}
                    className={`flex-1 min-h-[44px] py-2.5 rounded-xl text-center border transition-all active:scale-95 ${
                      difficulty === d.value
                        ? "bg-pink-500 text-white border-pink-500"
                        : "bg-white/80 text-ink/60 border-ink/10"
                    }`}>
                    <span className="block text-sm font-bold">
                      {d.value === "easy" ? t.easy[locale] : d.value === "medium" ? t.medium[locale] : t.hard[locale]}
                    </span>
                    <span className="block text-[10px] opacity-70">{d.grid}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Bet */}
            <div>
              <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">{t.betPerPlayer[locale]}</label>
              <div className="flex items-center gap-3">
                {[5, 10, 25, 50].map((v) => (
                  <button key={v} onClick={() => setBetCrc(v)}
                    className={`flex-1 min-h-[44px] py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95 ${
                      betCrc === v
                        ? "bg-pink-500 text-white border-pink-500"
                        : "bg-white/80 text-ink/60 border-ink/10"
                    }`}>
                    {v}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min={1} value={betCrc}
                  onChange={(e) => setBetCrc(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 px-3 py-2 rounded-xl border border-ink/10 bg-white/80 text-ink text-sm font-bold focus:outline-none focus:border-pink-400/40"
                />
                <span className="text-sm text-ink/50 leading-none">{t.crcPerPlayer[locale]}</span>
              </div>
            </div>

            {/* Private toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-ink/[0.03] border border-ink/5">
              <div className="flex items-center gap-2">
                {isPrivate ? <Lock className="w-4 h-4 text-ink/40" /> : <Globe className="w-4 h-4 text-ink/40" />}
                <span className="text-xs font-semibold text-ink/60">
                  {isPrivate ? (locale === "fr" ? "Partie privée" : "Private game") : (locale === "fr" ? "Partie publique" : "Public game")}
                </span>
              </div>
              <button onClick={() => setIsPrivate(!isPrivate)}
                className={`relative w-10 h-5 rounded-full transition-colors ${isPrivate ? "bg-pink-500" : "bg-ink/20"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${isPrivate ? "translate-x-5" : "translate-x-0.5"}`} />
              </button>
            </div>

            <div className="p-3 rounded-xl bg-ink/[0.03] border border-ink/5 text-xs text-ink/50">
              🏆 {t.winnerGets[locale]} <span className="font-bold text-ink">{betCrc * 2 * 0.95} CRC</span>
              <span className="ml-1">{t.commission[locale]}</span>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button onClick={createGame} disabled={loading} className="w-full rounded-xl font-bold"
              style={{ background: "#EC4899" }}>
              {loading ? <><Loader2 className="w-4 h-4 animate-spin motion-reduce:animate-none" /> {t.creating[locale]}</> : `${t.createBtn[locale]} — ${betCrc} CRC`}
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-ink">{t.joinGame[locale]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">{t.gameCode[locale]}</label>
              <input type="text" placeholder="Ex: M3K9PL" value={joinSlug}
                onChange={(e) => setJoinSlug(e.target.value.toUpperCase())} maxLength={6}
                className="w-full px-4 py-3 rounded-xl border border-ink/10 bg-white/80 text-ink text-center text-xl font-mono font-bold tracking-[0.3em] focus:outline-none focus:border-pink-400/40 uppercase"
              />
            </div>
            <Button onClick={joinGame} disabled={joinSlug.trim().length < 6} variant="outline"
              className="w-full rounded-xl font-bold border-ink/20 hover:border-pink-400/40">
              {t.join[locale]}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
