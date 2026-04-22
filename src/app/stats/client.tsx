"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingUp, Users, Coins, Gamepad2, History, ExternalLink } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useLocale } from "@/components/language-provider";
import { translations, localeBcp47 } from "@/lib/i18n";
import type { PlatformStats, PeriodStats, GameStatLine, DailyVolumePoint, TopGameMeta } from "@/lib/platform-stats";
import type { RecentGameRow } from "@/lib/recent-games";

const GNOSISSCAN_TX = "https://gnosisscan.io/tx/";

function shortenAddress(addr: string | null | undefined): string {
  if (!addr) return "-";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function formatRelativeDate(iso: string, locale: "fr" | "en"): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60_000);
  const tl = translations.lobby;
  if (mins < 1) return tl.justNow2[locale];
  if (mins < 60) return tl.minAgoSpaced[locale].replace("{n}", String(mins));
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tl.hourAgoSpaced[locale].replace("{n}", String(hours));
  const days = Math.floor(hours / 24);
  if (days < 7) return tl.dayAgoSpaced[locale].replace("{n}", String(days));
  return d.toLocaleDateString(localeBcp47(locale), {
    day: "2-digit",
    month: "short",
  });
}

function formatCrc(n: number | string, decimals = 0): string {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (!isFinite(num)) return "0";
  if (Math.abs(num) >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
  if (Math.abs(num) >= 1_000) return (num / 1_000).toFixed(1) + "k";
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function formatPct(n: number | null): string {
  if (n === null) return "-";
  return `${n.toFixed(1)}%`;
}

export default function StatsClient({ stats }: { stats: PlatformStats }) {
  const { locale } = useLocale();
  const t = translations.stats;

  const { casinoBank, period24h, period7d, period30d, allTime, games, daily30d, top5Games, recentGames } = stats;

  return (
    <div className="min-h-screen bg-sand dark:bg-black">
      <main className="mx-auto max-w-4xl px-4 py-10 flex flex-col gap-6">
        <Link
          href="/home"
          className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink/80 dark:text-white/50 dark:hover:text-white/80 transition-colors font-medium w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t.back[locale]}
        </Link>

        <header className="text-center space-y-2">
          <h1 className="font-display text-4xl font-bold text-ink dark:text-white">
            {t.title[locale]}
          </h1>
          <p className="text-sm text-ink/60 dark:text-white/60">{t.subtitle[locale]}</p>
        </header>

        {/* Banque casino — hero (vert dollar) */}
        <div className="rounded-3xl bg-gradient-to-br from-emerald-600 via-emerald-700 to-green-800 text-white p-8 shadow-lg ring-1 ring-emerald-400/30">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-white/70 mb-2">
            <Coins className="h-4 w-4" />
            {t.casinoBank[locale]}
          </div>
          <div className="text-5xl font-black font-display">
            {formatCrc(casinoBank.totalCrc, 2)} <span className="text-2xl text-white/70">CRC</span>
          </div>
          <p className="mt-2 text-xs text-white/60">
            {t.casinoBankDesc[locale]}
          </p>
          <div className="mt-4 flex gap-3 text-xs text-white/70">
            <span>
              {t.innerCrc[locale]} : <b>{formatCrc(casinoBank.innerCrc, 2)}</b>
            </span>
            <span>
              xCRC : <b>{formatCrc(casinoBank.wrappedCrc, 2)}</b>
            </span>
          </div>
        </div>

        {/* Profit / volume by period */}
        <div className="grid gap-4 sm:grid-cols-3">
          <PeriodCard label={t.last24h[locale]} stats={period24h} locale={locale} />
          <PeriodCard label={t.last7d[locale]} stats={period7d} locale={locale} />
          <PeriodCard label={t.last30d[locale]} stats={period30d} locale={locale} />
        </div>

        {/* All time + RTP global */}
        <div className="rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-ink/10 dark:border-white/10 shadow-sm p-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink/40 dark:text-white/40 mb-3">
            <TrendingUp className="h-4 w-4" />
            {t.allTime[locale]}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Metric label={t.wagered[locale]} value={formatCrc(allTime.wagered, 0) + " CRC"} />
            <Metric label={t.paidOut[locale]} value={formatCrc(allTime.paidOut, 0) + " CRC"} />
            <Metric
              label={t.profit[locale]}
              value={formatCrc(allTime.profit, 0) + " CRC"}
              accent={allTime.profit >= 0 ? "green" : "red"}
              sub={
                allTime.wagered > 0
                  ? `${allTime.profit >= 0 ? "+" : ""}${((allTime.profit / allTime.wagered) * 100).toFixed(1)}%`
                  : undefined
              }
            />
            <Metric label={t.rounds[locale]} value={formatCrc(allTime.rounds, 0)} />
          </div>
        </div>

        {/* Volume chart 30j */}
        <div className="rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-ink/10 dark:border-white/10 shadow-sm p-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink/40 dark:text-white/40 mb-4">
            <TrendingUp className="h-4 w-4" />
            {t.volumeChart[locale]}
          </div>
          <Volume30dChart points={daily30d} top5={top5Games} />
        </div>

        {/* Breakdown par jeu - all time */}
        <div className="rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-ink/10 dark:border-white/10 shadow-sm p-6">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink/40 dark:text-white/40 mb-4">
            <Gamepad2 className="h-4 w-4" />
            {t.byGame[locale]} ({t.allTime[locale]})
          </div>
          {games.length === 0 ? (
            <p className="text-sm text-ink/40 dark:text-white/40 italic">
              {t.noData[locale]}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-ink/40 dark:text-white/40 uppercase tracking-wider border-b border-ink/10 dark:border-white/10">
                    <th className="py-2">{t.colGame[locale]}</th>
                    <th className="py-2 text-right">{t.colVolume[locale]}</th>
                    <th className="py-2 text-right">{t.colRounds[locale]}</th>
                    <th className="py-2 text-right">{t.colRtp[locale]}</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((g) => (
                    <tr key={g.key} className="border-b border-ink/5 dark:border-white/5">
                      <td className="py-3 flex items-center gap-2">
                        <span>{g.emoji}</span>
                        <span className="font-medium text-ink dark:text-white">{g.label}</span>
                        <span className="text-[10px] uppercase tracking-wider text-ink/30 dark:text-white/30">
                          {g.category}
                        </span>
                      </td>
                      <td className="py-3 text-right font-mono text-ink dark:text-white">
                        {formatCrc(g.wagered, 0)}
                      </td>
                      <td className="py-3 text-right font-mono text-ink/60 dark:text-white/60">
                        {formatCrc(g.rounds, 0)}
                      </td>
                      <td className="py-3 text-right font-mono text-ink/60 dark:text-white/60">
                        {formatPct(g.rtp)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Historique recent */}
        <RecentHistorySection rows={recentGames} locale={locale} />

        <footer className="text-center text-xs text-ink/30 dark:text-white/30 py-8">
          {t.cached[locale]}
        </footer>
      </main>
    </div>
  );
}

function PeriodCard({
  label,
  stats,
  locale,
}: {
  label: string;
  stats: PeriodStats;
  locale: "fr" | "en";
}) {
  const t = translations.stats;
  return (
    <div className="rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-ink/10 dark:border-white/10 shadow-sm p-5">
      <div className="text-xs font-bold uppercase tracking-widest text-ink/40 dark:text-white/40">
        {label}
      </div>
      <div className="mt-3 space-y-2">
        <div>
          <div className="text-[10px] text-ink/40 dark:text-white/40 uppercase">
            {t.wagered[locale]}
          </div>
          <div className="text-xl font-bold font-mono text-ink dark:text-white">
            {formatCrc(stats.wagered, 0)} <span className="text-xs text-ink/40 dark:text-white/40">CRC</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] text-ink/40 dark:text-white/40 uppercase">
            {t.profit[locale]}
          </div>
          <div
            className={`text-xl font-bold font-mono ${
              stats.profit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"
            }`}
          >
            {stats.profit >= 0 ? "+" : ""}
            {formatCrc(stats.profit, 0)} <span className="text-xs opacity-60">CRC</span>
          </div>
        </div>
        <div className="flex justify-between text-xs text-ink/50 dark:text-white/50 pt-1">
          <span>
            {stats.rounds} {t.rounds[locale]}
          </span>
          <span>
            {stats.players} {t.players[locale]}
          </span>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  sub,
}: {
  label: string;
  value: string;
  accent?: "green" | "red";
  sub?: string;
}) {
  const color =
    accent === "green"
      ? "text-emerald-600 dark:text-emerald-400"
      : accent === "red"
      ? "text-red-500"
      : "text-ink dark:text-white";
  return (
    <div>
      <div className="text-[10px] text-ink/40 dark:text-white/40 uppercase tracking-wider">
        {label}
      </div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value}</div>
      {sub && (
        <div className={`text-[11px] font-mono mt-0.5 ${color}`}>{sub}</div>
      )}
    </div>
  );
}

function Volume30dChart({ points, top5 }: { points: DailyVolumePoint[]; top5: TopGameMeta[] }) {
  // Transforme les points en data utilisable par recharts :
  // { date, total, <key1>: vol, <key2>: vol, ... }
  const chartData = points.map((p) => {
    const base: Record<string, any> = {
      date: p.date.slice(5), // MM-DD
      total: p.totalCrc,
    };
    for (const g of top5) {
      base[g.key] = p.perGame[g.key] ?? 0;
    }
    return base;
  });

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.1} />
          <XAxis dataKey="date" stroke="currentColor" opacity={0.5} tick={{ fontSize: 10 }} />
          <YAxis stroke="currentColor" opacity={0.5} tick={{ fontSize: 10 }} />
          <Tooltip
            contentStyle={{
              background: "rgba(255,255,255,0.95)",
              border: "1px solid rgba(0,0,0,0.1)",
              borderRadius: 12,
              fontSize: 12,
            }}
            formatter={(value: any, name: any) => [
              `${formatCrc(Number(value ?? 0), 0)} CRC`,
              name,
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            iconType="circle"
          />
          {/* Ligne totale en gras */}
          <Line
            type="monotone"
            dataKey="total"
            stroke="#0f172a"
            strokeWidth={2.5}
            dot={false}
            name="Total"
          />
          {/* Top 5 jeux en lignes colorees fines */}
          {top5.map((g) => (
            <Line
              key={g.key}
              type="monotone"
              dataKey={g.key}
              stroke={g.color}
              strokeWidth={1.5}
              dot={false}
              name={`${g.emoji} ${g.label}`}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function RecentHistorySection({
  rows,
  locale,
}: {
  rows: RecentGameRow[];
  locale: "fr" | "en";
}) {
  const t = translations.stats;
  const [filter, setFilter] = useState<"all" | "multi" | "chance" | string>("all");

  // Jeux uniques presents dans l'historique (pour le filtre par jeu).
  const gameOptions = useMemo(() => {
    const map = new Map<string, { key: string; label: string; emoji: string }>();
    for (const r of rows) {
      if (!map.has(r.key)) map.set(r.key, { key: r.key, label: r.label, emoji: r.emoji });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "multi" || filter === "chance") {
      return rows.filter((r) => r.category === filter);
    }
    return rows.filter((r) => r.key === filter);
  }, [rows, filter]);

  const filterBtn = (value: string, label: string) => (
    <button
      key={value}
      onClick={() => setFilter(value)}
      className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
        filter === value
          ? "bg-marine text-white dark:bg-white dark:text-marine"
          : "bg-ink/5 text-ink/60 hover:bg-ink/10 dark:bg-white/10 dark:text-white/60 dark:hover:bg-white/20"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="rounded-2xl bg-white/70 dark:bg-white/5 backdrop-blur-sm border border-ink/10 dark:border-white/10 shadow-sm p-6">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-ink/40 dark:text-white/40 mb-1">
        <History className="h-4 w-4" />
        {t.recentHistory[locale]}
      </div>
      <p className="text-xs text-ink/50 dark:text-white/50 mb-4">
        {t.recentHistoryDesc[locale]}
      </p>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filterBtn("all", t.filterAll[locale])}
        {filterBtn("multi", t.filterMulti[locale])}
        {filterBtn("chance", t.filterChance[locale])}
        <span className="mx-1 text-ink/20 dark:text-white/20">|</span>
        {gameOptions.map((g) =>
          filterBtn(g.key, `${g.emoji} ${g.label}`)
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-ink/40 dark:text-white/40 italic">{t.noHistory[locale]}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink/40 dark:text-white/40 uppercase tracking-wider border-b border-ink/10 dark:border-white/10">
                <th className="py-2">{t.colGame[locale]}</th>
                <th className="py-2">{t.colPlayer[locale]}</th>
                <th className="py-2 text-right">{t.colBet[locale]}</th>
                <th className="py-2 text-right">{t.colResult[locale]}</th>
                <th className="py-2 text-right">{t.colDate[locale]}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <RecentHistoryRow key={`${r.key}-${r.createdAt}-${i}`} row={r} locale={locale} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RecentHistoryRow({ row, locale }: { row: RecentGameRow; locale: "fr" | "en" }) {
  const t = translations.stats;
  const bet = row.betCrc;
  const payout = row.payoutCrc;
  const net = payout - bet;

  const resultColor =
    row.outcome === "win"
      ? "text-emerald-600 dark:text-emerald-400"
      : row.outcome === "loss"
      ? "text-red-500"
      : "text-ink/60 dark:text-white/60";
  const resultLabel =
    row.outcome === "win" ? t.resultWin[locale] : row.outcome === "loss" ? t.resultLoss[locale] : t.resultDraw[locale];

  return (
    <tr className="border-b border-ink/5 dark:border-white/5">
      <td className="py-3">
        <div className="flex items-center gap-2">
          <span>{row.emoji}</span>
          <span className="font-medium text-ink dark:text-white">{row.label}</span>
          <span className="text-[10px] uppercase tracking-wider text-ink/30 dark:text-white/30">
            {row.category}
          </span>
        </div>
      </td>
      <td className="py-3 font-mono text-xs text-ink/70 dark:text-white/70">
        {shortenAddress(row.playerAddress)}
        {row.opponentAddress && (
          <span className="text-ink/40 dark:text-white/40">
            {" "}{t.vsOpponent[locale]} {shortenAddress(row.opponentAddress)}
          </span>
        )}
      </td>
      <td className="py-3 text-right font-mono text-ink dark:text-white">
        {formatCrc(bet, 0)}
      </td>
      <td className={`py-3 text-right font-mono ${resultColor}`}>
        <div className="flex items-center justify-end gap-1">
          <span className="text-[11px] uppercase opacity-70">{resultLabel}</span>
          <span>
            {net >= 0 ? "+" : ""}
            {formatCrc(net, 0)}
          </span>
          {row.txHash && (
            <a
              href={`${GNOSISSCAN_TX}${row.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-ink/40 hover:text-ink/80 dark:text-white/40 dark:hover:text-white/80"
              title="Voir on-chain"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </td>
      <td className="py-3 text-right text-xs text-ink/50 dark:text-white/50">
        {formatRelativeDate(row.createdAt, locale)}
      </td>
    </tr>
  );
}
