"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ArrowRight, Archive, CheckCircle2, Lock, Sparkles, Ticket, Trophy, Users } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { translations } from "@/lib/i18n";
import { darkSafeColor } from "@/lib/utils";

type LotteryCard = {
  id: number;
  slug: string;
  title: string;
  organizer: string;
  description: string | null;
  ticketPriceCrc: number;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  theme: string;
  status: string;
};

export default function HomePage() {
  const [activeLotteries, setActiveLotteries] = useState<LotteryCard[]>([]);
  const [completedLotteries, setCompletedLotteries] = useState<LotteryCard[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const h = translations.home;


  const fetchLotteries = useCallback(async () => {
    try {
      const endpoint = "/api/lotteries?status=visible";
      const res = await fetch(endpoint);
      const data = await res.json();
      const list: LotteryCard[] = Array.isArray(data) ? data : data.lotteries || [];

      setActiveLotteries(list.filter((l) => l.status === "active"));
      setCompletedLotteries(list.filter((l) => l.status === "completed"));

      if (list.length > 0) {
        const countsMap: Record<number, number> = {};
        await Promise.all(
          list.map(async (l) => {
            try {
              const pRes = await fetch(`/api/participants?lotteryId=${l.id}`);
              const pData = await pRes.json();
              countsMap[l.id] = pData.count || 0;
            } catch {
              countsMap[l.id] = 0;
            }
          })
        );
        setCounts(countsMap);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLotteries();
  }, [fetchLotteries]);

  const renderStatusBadge = (lottery: LotteryCard) => {
    if (lottery.status === "completed") {
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-lg">
          <CheckCircle2 className="h-3 w-3" />
          {h.completed[locale]}
        </span>
      );
    }
    if (lottery.status === "archived") {
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">
          <Archive className="h-3 w-3" />
          {h.archived[locale]}
        </span>
      );
    }
    return null;
  };

  // Admin buttons removed — use /admin page instead

  const renderLotteryCard = (lottery: LotteryCard) => {
    const isInactive = lottery.status !== "active";
    const displayColor = darkSafeColor(lottery.primaryColor, isDark);

    return (
      <Link
        key={lottery.id}
        href={`/loterie/${lottery.slug}`}
        className={`group rounded-3xl border-2 p-6 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col ${
          isInactive
            ? "border-ink/5 bg-white/50 opacity-80"
            : "border-ink/5 bg-white/80 backdrop-blur-sm hover:border-ink/10"
        }`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {lottery.logoUrl ? (
              <img
                src={lottery.logoUrl}
                alt={lottery.title}
                className={`h-10 w-10 rounded-xl object-contain ${isInactive ? "grayscale" : ""}`}
              />
            ) : (
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: displayColor + "20" }}
              >
                <Sparkles className="h-5 w-5" style={{ color: displayColor }} />
              </div>
            )}
            <div>
              <h2 className="font-display text-lg font-bold text-ink group-hover:text-ink/80 transition-colors">
                {lottery.title}
              </h2>
              <p className="text-xs text-ink/40">{h.by[locale]} {lottery.organizer}</p>
            </div>
          </div>
          {renderStatusBadge(lottery)}
        </div>

        {lottery.description && (
          <p className="text-sm text-ink/60 mb-4 line-clamp-2 flex-1">
            {lottery.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto pt-4 border-t border-ink/5">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="text-lg font-bold"
                style={{ color: displayColor }}
              >
                {lottery.ticketPriceCrc}
              </span>
              <span className="text-xs text-ink/40 font-medium">CRC</span>
            </div>
            <div className="flex items-center gap-1 text-ink/40">
              <Users className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{counts[lottery.id] || 0}</span>
            </div>
          </div>
          <div
            className="flex items-center gap-1 text-sm font-semibold group-hover:gap-2 transition-all"
            style={{ color: displayColor }}
          >
            {isInactive ? h.viewResults[locale] : h.participate[locale]}
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>

              </Link>
    );
  };

  return (
    <main className="px-4 py-10 md:py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="space-y-4 text-center relative">
          <div className="absolute left-0 top-0">
            <Link href="/chance" className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors">
              <ArrowLeft className="h-4 w-4" />
              {locale === "fr" ? "Retour" : "Back"}
            </Link>
          </div>
          <div className="flex items-center justify-center gap-4">
            <img src="/nf-society-logo.png" alt="NF Society" className="h-20 w-20 rounded-2xl object-cover" />
            <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">
              NF Society
            </h1>
          </div>
          <p className="max-w-2xl mx-auto text-lg text-ink/70">
            {h.subtitleBefore[locale]}{" "}
            <span className="inline-flex items-center gap-1.5 align-middle">
              <img src="/gnosis-logo.png" alt="Gnosis" className="h-5 w-5 inline" />
              Gnosis{locale === "en" ? " blockchain" : ""}
            </span>
          </p>
        </header>

        {loading ? (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-3xl border-2 border-ink/5 bg-white/60 p-6 animate-pulse">
                <div className="h-6 w-32 bg-ink/10 rounded mb-3" />
                <div className="h-4 w-48 bg-ink/5 rounded mb-6" />
                <div className="h-10 w-full bg-ink/5 rounded-xl" />
              </div>
            ))}
          </div>
        ) : activeLotteries.length === 0 && completedLotteries.length === 0 ? (
          <div className="text-center py-16">
            <Ticket className="h-12 w-12 text-ink/20 mx-auto mb-4" />
            <p className="text-lg text-ink/50">{h.noLotteries[locale]}</p>
            <p className="text-sm text-ink/30 mt-2">{h.noLotteriesSub[locale]}</p>
          </div>
        ) : (
          <div className="space-y-12">
            {activeLotteries.length > 0 && (
              <section>
                <h2 className="font-display text-xl font-bold text-ink mb-5 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-indigo-500" />
                  {h.activeLotteries[locale]}
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {activeLotteries.map((lottery) => renderLotteryCard(lottery))}
                </div>
              </section>
            )}

            {completedLotteries.length > 0 && (
              <section>
                <h2 className="font-display text-xl font-bold text-ink/60 mb-5 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  {h.completedLotteries[locale]}
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {completedLotteries.map((lottery) => renderLotteryCard(lottery))}
                </div>
              </section>
            )}

          </div>
        )}

        <footer className="mt-8 pt-8 border-t border-ink/5 flex flex-col items-center gap-4">
          <div className="flex items-center justify-center gap-3 mb-1">
            <img src="/gnosis-logo.png" alt="Gnosis" className="h-5 w-5 opacity-70" />
            <Image src="/logo-color.png" alt="Circles" width={80} height={24} className="h-5 w-auto opacity-70" />
          </div>
          <p className="text-xs text-ink/70">
            {h.builtOn[locale]}
          </p>
          <p className="text-xs text-ink/50">
            {h.footer[locale]}
          </p>
        </footer>
      </div>
    </main>
  );
}
