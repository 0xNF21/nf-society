"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Archive, CheckCircle2, Lock, LogOut, RefreshCw, Sparkles, Ticket, Trophy, Users } from "lucide-react";
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
  const [archivedLotteries, setArchivedLotteries] = useState<LotteryCard[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const { locale } = useLocale();
  const h = translations.home;

  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminAuth, setAdminAuth] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [statusChanging, setStatusChanging] = useState<number | null>(null);

  const fetchLotteries = useCallback(async () => {
    try {
      const endpoint = adminAuth ? "/api/lotteries" : "/api/lotteries?status=visible";
      const res = await fetch(endpoint);
      const data = await res.json();
      const list: LotteryCard[] = Array.isArray(data) ? data : data.lotteries || [];

      setActiveLotteries(list.filter((l) => l.status === "active"));
      setCompletedLotteries(list.filter((l) => l.status === "completed"));
      setArchivedLotteries(list.filter((l) => l.status === "archived"));

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
  }, [adminAuth]);

  useEffect(() => {
    fetchLotteries();
  }, [fetchLotteries]);

  const handleAdminLogin = async () => {
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      if (res.ok) {
        setAdminAuth(true);
        setAuthError("");
      } else {
        setAuthError("incorrect");
      }
    } catch {
      setAuthError("incorrect");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleStatusChange = async (lottery: LotteryCard, newStatus: string) => {
    const confirmMsg = newStatus === "completed"
      ? h.confirmComplete[locale]
      : newStatus === "archived"
        ? h.confirmArchive[locale]
        : null;

    if (confirmMsg && !window.confirm(confirmMsg)) return;

    setStatusChanging(lottery.id);
    try {
      const res = await fetch(`/api/lotteries/${lottery.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword, status: newStatus }),
      });
      if (res.ok) {
        await fetchLotteries();
      }
    } catch {
    } finally {
      setStatusChanging(null);
    }
  };

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

  const renderAdminButtons = (lottery: LotteryCard) => {
    if (!adminAuth) return null;
    const isChanging = statusChanging === lottery.id;

    return (
      <div className="flex gap-2 mt-3 pt-3 border-t border-ink/5" onClick={(e) => e.preventDefault()}>
        {lottery.status === "active" && (
          <>
            <button
              onClick={() => handleStatusChange(lottery, "completed")}
              disabled={isChanging}
              className="flex-1 text-xs font-semibold py-1.5 px-2 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              {h.markCompleted[locale]}
            </button>
            <button
              onClick={() => handleStatusChange(lottery, "archived")}
              disabled={isChanging}
              className="flex-1 text-xs font-semibold py-1.5 px-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {h.archiveLottery[locale]}
            </button>
          </>
        )}
        {lottery.status === "completed" && (
          <>
            <button
              onClick={() => handleStatusChange(lottery, "active")}
              disabled={isChanging}
              className="flex-1 text-xs font-semibold py-1.5 px-2 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              {h.reactivateLottery[locale]}
            </button>
            <button
              onClick={() => handleStatusChange(lottery, "archived")}
              disabled={isChanging}
              className="flex-1 text-xs font-semibold py-1.5 px-2 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {h.archiveLottery[locale]}
            </button>
          </>
        )}
        {lottery.status === "archived" && (
          <button
            onClick={() => handleStatusChange(lottery, "active")}
            disabled={isChanging}
            className="flex-1 text-xs font-semibold py-1.5 px-2 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50"
          >
            {h.reactivateLottery[locale]}
          </button>
        )}
      </div>
    );
  };

  const renderLotteryCard = (lottery: LotteryCard) => {
    const isInactive = lottery.status !== "active";

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
            {isInactive ? h.viewResults[locale] : h.participate[locale]}
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>

        {renderAdminButtons(lottery)}
      </Link>
    );
  };

  return (
    <main className="px-4 py-10 md:py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
        <header className="space-y-4 text-center relative">
          <div className="absolute right-0 top-0">
            <LanguageSwitcher />
          </div>
          <div className="flex items-center justify-center gap-3 mb-4">
            <Image src="/logo-color.png" alt="Circles" width={160} height={48} className="h-12 w-auto" priority />
            <img src="/gnosis-logo.png" alt="Gnosis Chain" className="h-10 w-10" />
          </div>
          <div className="flex items-center justify-center gap-4">
            <img src="/nf-society-logo.png" alt="NF Society" className="h-16 w-16 rounded-2xl object-cover" />
            <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">
              NF Society
            </h1>
          </div>
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
        ) : activeLotteries.length === 0 && completedLotteries.length === 0 && !adminAuth ? (
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

            {adminAuth && archivedLotteries.length > 0 && (
              <section>
                <h2 className="font-display text-xl font-bold text-ink/40 mb-5 flex items-center gap-2">
                  <Archive className="h-5 w-5 text-gray-400" />
                  {h.archivedLotteries[locale]}
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {archivedLotteries.map((lottery) => renderLotteryCard(lottery))}
                </div>
              </section>
            )}

            {adminAuth && archivedLotteries.length === 0 && (
              <section>
                <h2 className="font-display text-xl font-bold text-ink/40 mb-5 flex items-center gap-2">
                  <Archive className="h-5 w-5 text-gray-400" />
                  {h.archivedLotteries[locale]}
                </h2>
                <p className="text-sm text-ink/30">{h.noArchivedLotteries[locale]}</p>
              </section>
            )}
          </div>
        )}

        <footer className="mt-8 pt-8 border-t border-ink/5 flex flex-col items-center gap-4">
          <p className="text-xs text-ink/30">
            {h.footer[locale]}
          </p>
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xs text-ink/20 hover:text-ink/40 transition-colors">
              {h.createLottery[locale]}
            </Link>
            {adminAuth ? (
              <button
                onClick={() => {
                  setAdminAuth(false);
                  setAdminPassword("");
                  setIsAdminOpen(false);
                  setAuthError("");
                }}
                className="flex items-center gap-1 text-xs text-ink/20 hover:text-ink/40 transition-colors"
              >
                <LogOut className="h-3 w-3" />
                {h.logout[locale]}
              </button>
            ) : (
              <button
                onClick={() => setIsAdminOpen(!isAdminOpen)}
                className="flex items-center gap-1 text-xs text-ink/20 hover:text-ink/40 transition-colors"
              >
                <Lock className="h-3 w-3" />
                {h.adminZone[locale]}
              </button>
            )}
          </div>

          {isAdminOpen && !adminAuth && (
            <div className="bg-white border-2 border-ink/10 rounded-2xl p-6 shadow-xl w-full max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h3 className="text-sm font-bold text-ink mb-3 flex items-center gap-2">
                <Lock className="h-4 w-4" />
                {h.adminZone[locale]}
              </h3>
              <div className="space-y-3">
                <input
                  type="password"
                  placeholder={h.adminPasswordPlaceholder[locale]}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                  className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
                {authError && (
                  <p className="text-xs text-red-600 font-medium">{h.incorrectPassword[locale]}</p>
                )}
                <button
                  onClick={handleAdminLogin}
                  disabled={authLoading || !adminPassword.trim()}
                  className="w-full bg-ink text-white font-semibold text-sm py-2 rounded-xl hover:bg-ink/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {authLoading ? (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      {h.verifying[locale]}
                    </>
                  ) : (
                    h.login[locale]
                  )}
                </button>
              </div>
            </div>
          )}
        </footer>
      </div>
    </main>
  );
}
