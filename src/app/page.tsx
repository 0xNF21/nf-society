"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, Ticket, Trophy, Users, Sparkles } from "lucide-react";
import { useLocale, LanguageSwitcher } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

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
  const h = translations.home;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/lotteries?status=visible");
        const data = await res.json();
        const list: LotteryCard[] = Array.isArray(data) ? data : data.lotteries || [];

        const active = list.filter((l) => l.status === "active");
        const completed = list.filter((l) => l.status === "completed");
        setActiveLotteries(active);
        setCompletedLotteries(completed);

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
    })();
  }, []);

  const renderLotteryCard = (lottery: LotteryCard, isCompleted: boolean) => (
    <Link
      key={lottery.id}
      href={`/loterie/${lottery.slug}`}
      className={`group rounded-3xl border-2 p-6 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col ${
        isCompleted
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
              className={`h-10 w-10 rounded-xl object-contain ${isCompleted ? "grayscale" : ""}`}
            />
          ) : (
            <div
              className="h-10 w-10 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: lottery.primaryColor + "20" }}
            >
              <Sparkles className="h-5 w-5" style={{ color: lottery.primaryColor }} />
            </div>
          )}
          <div>
            <h2 className="font-display text-lg font-bold text-ink group-hover:text-ink/80 transition-colors">
              {lottery.title}
            </h2>
            <p className="text-xs text-ink/40">{h.by[locale]} {lottery.organizer}</p>
          </div>
        </div>
        {isCompleted && (
          <span className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-lg">
            <CheckCircle2 className="h-3 w-3" />
            {h.completed[locale]}
          </span>
        )}
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
              style={{ color: lottery.primaryColor }}
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
          style={{ color: lottery.primaryColor }}
        >
          {isCompleted ? h.viewResults[locale] : h.participate[locale]}
          <ArrowRight className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );

  return (
    <main className="px-4 py-10 md:py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="space-y-4 text-center relative">
          <div className="absolute right-0 top-0">
            <LanguageSwitcher />
          </div>
          <div className="flex justify-center mb-4">
            <Image src="/logo-color.png" alt="NF Society" width={160} height={48} className="h-12 w-auto" priority />
          </div>
          <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">
            NF Society
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-ink/70">
            {h.subtitle[locale]}
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
                  {activeLotteries.map((lottery) => renderLotteryCard(lottery, false))}
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
                  {completedLotteries.map((lottery) => renderLotteryCard(lottery, true))}
                </div>
              </section>
            )}
          </div>
        )}

        <footer className="mt-8 pt-8 border-t border-ink/5 text-center">
          <p className="text-xs text-ink/30">
            {h.footer[locale]}
          </p>
          <Link href="/dashboard" className="text-xs text-ink/20 hover:text-ink/40 mt-2 inline-block transition-colors">
            {h.createLottery[locale]}
          </Link>
        </footer>
      </div>
    </main>
  );
}
