"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft, Gamepad2 } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

export default function MorpionLobby() {
  const router = useRouter();
  const { locale } = useLocale();
  const t = translations.morpion;
  const [betCrc, setBetCrc] = useState(10);
  const [joinSlug, setJoinSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function createGame() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/morpion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ betCrc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      sessionStorage.setItem(`morpion_creator_${data.slug}`, "1");
      router.push(`/morpion/${data.slug}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function joinGame() {
    const s = joinSlug.trim().toUpperCase();
    if (s.length < 6) return;
    router.push(`/morpion/${s}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">

        {/* Back */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-marine/10 mb-4">
            <Gamepad2 className="w-8 h-8 text-marine" />
          </div>
          <h1 className="text-3xl font-bold text-ink mb-2">{t.title[locale]}</h1>
          <p className="text-ink/50 text-sm">{t.subtitle[locale]}</p>
        </div>

        {/* Create game */}
        <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-ink">{t.createGame[locale]}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">{t.betPerPlayer[locale]}</label>
              <div className="flex items-center gap-3">
                {[5, 10, 25, 50].map((v) => (
                  <button key={v} onClick={() => setBetCrc(v)}
                    className={`flex-1 py-2 rounded-xl text-sm font-bold border transition-all ${betCrc === v ? "bg-marine text-white border-marine" : "bg-white/80 text-ink/60 border-ink/10 hover:border-marine/40"}`}>
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

            <div className="p-3 rounded-xl bg-ink/[0.03] border border-ink/5 text-xs text-ink/50">
              🏆 {t.winnerGets[locale]} <span className="font-bold text-ink">{Math.floor(betCrc * 2 * 0.95)} CRC</span>
              <span className="ml-1">{t.commission[locale]}</span>
            </div>

            {error && <p className="text-xs text-red-500">{error}</p>}

            <Button onClick={createGame} disabled={loading} className="w-full rounded-xl font-bold"
              style={{ background: "#251B9F" }}>
              {loading ? t.creating[locale] : `${t.createBtn[locale]} — ${betCrc} CRC`}
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
              <label className="block text-xs font-semibold text-ink/40 uppercase tracking-widest mb-2">{t.gameCode[locale]}</label>
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
