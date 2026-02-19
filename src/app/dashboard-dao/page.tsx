"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Users,
  Trophy,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  UserX,
  ChevronDown,
  Flame,
  Star,
  Clock,
  DollarSign,
  Wallet,
  TrendingUp,
  TrendingDown,
  Send,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useLocale, LanguageSwitcher } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

type DaoData = {
  groupAddress: string;
  treasuryAddress: string;
  members: string[];
  memberTrust: Record<string, { trustedByGroup: boolean; trustsGroup: boolean }>;
  contributions: Array<{
    address: string;
    totalCRC: number;
    lastContributionTs: number;
    isMember: boolean;
  }>;
  allAffiliates: string[];
  inactive: {
    fiveDays: string[];
    twoWeeks: string[];
    oneMonth: string[];
    twoMonths: string[];
    never: string[];
  };
  totalBurned: number;
  weeklyContributions: Array<{
    address: string;
    weeklyCRC: number;
    isMember: boolean;
  }>;
  latestClaims: Array<{
    address: string;
    amount: number;
    timestamp: number;
  }>;
  totalMembers: number;
  totalAffiliates: number;
  activeAffiliates5d: number;
  fetchedAt: number;
};

type TreasuryHolding = {
  symbol: string;
  name: string;
  balance: number;
  price: number;
  valueUsd: number;
  color: string;
  iconUrl?: string | null;
  acquisitionPrice?: number | null;
  acquiredAt?: string | null;
};

type TreasuryData = {
  address: string;
  chain: string;
  holdings: TreasuryHolding[];
  totalUsd: number;
  totalCostBasis?: number;
  totalPnl?: number | null;
  totalPnlPercent?: number | null;
  fetchedAt: number;
};

type Profile = {
  name?: string;
  imageUrl?: string | null;
  avatarUrl?: string;
};

const AUTO_REFRESH_MS = 60 * 60 * 1000;

function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function ProfileAvatar({
  address,
  profiles,
  size = "sm",
}: {
  address: string;
  profiles: Record<string, Profile>;
  size?: "sm" | "md";
}) {
  const profile = profiles[address.toLowerCase()];
  const imgUrl = profile?.avatarUrl || profile?.imageUrl;
  const sizeClass = size === "md" ? "h-8 w-8" : "h-6 w-6";
  const textSize = size === "md" ? "text-xs" : "text-[10px]";

  return (
    <div className="flex items-center gap-2 min-w-0">
      {imgUrl ? (
        <img src={imgUrl} alt="" className={`${sizeClass} rounded-full object-cover flex-shrink-0`} />
      ) : (
        <div className={`${sizeClass} rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0`}>
          <span className={`${textSize} font-bold text-emerald-600`}>{address.slice(2, 4).toUpperCase()}</span>
        </div>
      )}
      <span className="truncate text-sm font-medium text-ink">
        {profile?.name || shortenAddress(address)}
      </span>
    </div>
  );
}

function Accordion({
  title,
  icon,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: string | number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-ink/5 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="font-display text-lg font-bold text-ink">{title}</span>
          {badge !== undefined && (
            <span className="text-xs font-semibold bg-ink/5 text-ink/50 px-2.5 py-0.5 rounded-full">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown className={`h-5 w-5 text-ink/30 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-5 pb-5 pt-0">{children}</div>}
    </div>
  );
}

function InactiveFilter({
  locale,
  selected,
  onChange,
}: {
  locale: "fr" | "en";
  selected: string;
  onChange: (v: string) => void;
}) {
  const t = translations.dao;
  const options = [
    { value: "5d", label: t.since5days[locale] },
    { value: "2w", label: t.since2weeks[locale] },
    { value: "1m", label: t.since1month[locale] },
    { value: "2m", label: t.since2months[locale] },
    { value: "never", label: t.neverContributed[locale] },
    { value: "all", label: t.allInactive[locale] },
  ];

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
            selected === opt.value
              ? "bg-red-100 text-red-700 shadow-sm"
              : "bg-ink/5 text-ink/40 hover:bg-ink/10 hover:text-ink/60"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function DashboardDaoPage() {
  const { locale } = useLocale();
  const t = translations.dao;

  const [data, setData] = useState<DaoData | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inactiveFilter, setInactiveFilter] = useState("5d");
  const [crcPrice, setCrcPrice] = useState<number | null>(null);
  const [treasury, setTreasury] = useState<TreasuryData | null>(null);
  const [treasuryHistory, setTreasuryHistory] = useState<any>(null);
  const [perfPeriod, setPerfPeriod] = useState("30d");
  const [pnlOpen, setPnlOpen] = useState(true);
  const [chartOpen, setChartOpen] = useState(true);
  const [distributions, setDistributions] = useState<{ totalUsd: number; transferCount: number; fetchedAt: number } | null>(null);
  const [distributionsRefreshing, setDistributionsRefreshing] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  async function fetchProfiles(addresses: string[]) {
    const batchSize = 30;
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      try {
        const profileRes = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: batch }),
        });
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setProfiles((prev) => ({ ...prev, ...(profileData.profiles || {}) }));
        }
      } catch {}
    }
  }

  async function fetchCrcPrice() {
    try {
      const res = await fetch("/api/crc-price", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (json.price) setCrcPrice(json.price);
      }
    } catch {}
  }

  async function fetchTreasury() {
    try {
      const res = await fetch("/api/treasury", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (!json.error) setTreasury(json);
      }
    } catch {}
  }

  async function fetchTreasuryHistory() {
    try {
      const res = await fetch("/api/treasury/history", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (!json.error) setTreasuryHistory(json);
      }
    } catch {}
  }

  async function fetchDistributions(refresh = false) {
    try {
      if (refresh) setDistributionsRefreshing(true);
      const url = refresh ? "/api/distributions?refresh=true" : "/api/distributions";
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        if (!json.error) setDistributions(json);
      }
    } catch {} finally {
      setDistributionsRefreshing(false);
    }
  }

  async function loadData(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [res] = await Promise.all([fetch("/api/dao", { cache: "no-store" }), fetchCrcPrice(), fetchTreasury(), fetchTreasuryHistory(), fetchDistributions()]);
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
      setLoading(false);
      setRefreshing(false);

      const allAddresses = new Set<string>();
      (json.members || []).forEach((m: string) => allAddresses.add(m));
      (json.contributions || []).forEach((c: any) => allAddresses.add(c.address));
      (json.allAffiliates || []).forEach((a: string) => allAddresses.add(a));
      (json.weeklyContributions || []).forEach((c: any) => allAddresses.add(c.address));
      (json.latestClaims || []).forEach((c: any) => allAddresses.add(c.address));
      fetchProfiles([...allAddresses]);
    } catch (err: any) {
      setError(err.message || "Unknown error");
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadData();
    intervalRef.current = setInterval(() => loadData(true), AUTO_REFRESH_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function getFilteredInactive(): string[] {
    if (!data?.inactive) return [];
    let list: string[];
    switch (inactiveFilter) {
      case "5d":
        list = data.inactive.fiveDays;
        break;
      case "2w":
        list = data.inactive.twoWeeks;
        break;
      case "1m":
        list = data.inactive.oneMonth;
        break;
      case "2m":
        list = data.inactive.twoMonths;
        break;
      case "never":
        list = data.inactive.never;
        break;
      case "all":
        list = [
          ...data.inactive.fiveDays,
          ...data.inactive.twoWeeks,
          ...data.inactive.oneMonth,
          ...data.inactive.twoMonths,
          ...data.inactive.never,
        ];
        break;
      default:
        list = data.inactive.fiveDays;
    }

    const contribMap = new Map(
      data.contributions.map((c) => [c.address, c])
    );
    return [...list].sort((a, b) => {
      const aTs = contribMap.get(a)?.lastContributionTs || 0;
      const bTs = contribMap.get(b)?.lastContributionTs || 0;
      return aTs - bTs;
    });
  }

  const totalInactive = data
    ? (data.inactive.fiveDays.length + data.inactive.twoWeeks.length + data.inactive.oneMonth.length + (data.inactive.twoMonths?.length || 0) + data.inactive.never.length)
    : 0;

  const totalCRC = data
    ? data.contributions.reduce((sum, c) => sum + c.totalCRC, 0)
    : 0;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors">
            <ArrowLeft className="h-4 w-4" />
            {t.back[locale]}
          </Link>
          <div className="flex items-center gap-3">
            {data && (
              <button
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-ink/40 hover:text-ink/70 hover:bg-ink/5 transition-colors disabled:opacity-50"
                title={t.refreshData[locale]}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                {t.refresh[locale]}
              </button>
            )}
            <LanguageSwitcher />
          </div>
        </div>

        <header className="text-center mb-10">
          <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
            <BarChart3 className="h-8 w-8 text-emerald-500" />
          </div>
          <h1 className="font-display text-3xl font-bold text-ink sm:text-4xl">
            {t.title[locale]}
          </h1>
          <p className="text-ink/50 mt-2">{t.subtitle[locale]}</p>
        </header>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="h-8 w-8 text-emerald-500 animate-spin" />
            <p className="text-ink/50">{t.loading[locale]}</p>
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <AlertCircle className="h-8 w-8 text-red-400" />
            <p className="text-ink/60">{t.error[locale]}</p>
            <p className="text-sm text-ink/40">{error}</p>
            <button
              onClick={() => loadData()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              {t.retry[locale]}
            </button>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-4">
            <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
              <StatCard icon={<Users className="h-4 w-4 text-emerald-500" />} value={data.totalMembers} label={t.members[locale]} />
              <StatCard icon={<Users className="h-4 w-4 text-blue-500" />} value={data.totalAffiliates} label={t.affiliates[locale]} />
              <StatCard icon={<Users className="h-4 w-4 text-green-500" />} value={data.activeAffiliates5d} label={t.activeAffiliates[locale]} />
              <StatCard
                icon={<Trophy className="h-4 w-4 text-amber-500" />}
                value={`${Math.round(totalCRC).toLocaleString()}`}
                label={t.totalCrc[locale]}
                sub={crcPrice ? `≈ $${(totalCRC * crcPrice).toFixed(2)}` : undefined}
              />
              <StatCard icon={<Flame className="h-4 w-4 text-red-500" />} value={`${data.totalBurned}`} label={t.crcBurned[locale]} />
              <StatCard
                icon={<DollarSign className="h-4 w-4 text-green-600" />}
                value={crcPrice ? `$${crcPrice.toFixed(4)}` : "—"}
                label={t.crcPrice[locale]}
              />
            </div>

            {distributions && (
              <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-500/20 p-2 rounded-lg">
                    <Send className="h-5 w-5 text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-zinc-400">{t.distributedToMembers[locale]}</p>
                    <p className="text-xl font-bold text-white">${distributions.totalUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-xs text-zinc-500">{distributions.transferCount} {t.transfers[locale]} — via Peanut Protocol (Arbitrum)</p>
                  </div>
                </div>
                <button
                  onClick={() => fetchDistributions(true)}
                  disabled={distributionsRefreshing}
                  className="text-zinc-400 hover:text-white transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={`h-4 w-4 ${distributionsRefreshing ? "animate-spin" : ""}`} />
                </button>
              </div>
            )}

            {(() => {
              const crcValueUsd = crcPrice ? totalCRC * crcPrice : 0;
              const allHoldings: TreasuryHolding[] = [];
              if (crcValueUsd > 0) {
                allHoldings.push({
                  symbol: "CRC",
                  name: "Circles",
                  valueUsd: crcValueUsd,
                  balance: totalCRC,
                  price: crcPrice || 0,
                  color: "#10B981",
                  iconUrl: "/crc-logo.png",
                  acquisitionPrice: 0,
                  acquiredAt: null,
                });
              }
              if (treasury?.holdings) {
                allHoldings.push(...treasury.holdings);
              }
              const grandTotal = allHoldings.reduce((s, h) => s + h.valueUsd, 0);

              const trackedHoldings = allHoldings.filter((h) => h.acquisitionPrice !== null && h.acquisitionPrice !== undefined);
              const totalCostBasis = trackedHoldings.reduce((sum, h) => sum + (h.acquisitionPrice || 0) * h.balance, 0);
              const trackedCurrentValue = trackedHoldings.reduce((sum, h) => sum + h.valueUsd, 0);
              const hasPnlData = trackedHoldings.length > 0;
              const totalPnl = hasPnlData ? trackedCurrentValue - totalCostBasis : null;
              const totalPnlPercent = hasPnlData && totalCostBasis > 0 ? ((trackedCurrentValue - totalCostBasis) / totalCostBasis) * 100 : null;

              if (allHoldings.length > 0) {
                const pieData = allHoldings.map((h) => ({
                  name: h.symbol,
                  value: h.valueUsd,
                  color: h.color,
                  iconUrl: h.iconUrl,
                }));

                return (
                  <div className="rounded-2xl border border-ink/5 bg-white shadow-sm p-3 mb-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                          <Wallet className="h-4 w-4 text-emerald-500" />
                        </div>
                        <div>
                          <h2 className="font-display text-lg font-bold text-ink">{t.totalTreasury[locale]}</h2>
                          <p className="text-3xl font-bold text-emerald-600">${grandTotal.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>

                    {(totalPnl !== null || treasuryHistory) && (
                      <div className="mb-2">
                        <button
                          onClick={() => setPnlOpen(!pnlOpen)}
                          className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50/50 transition-colors"
                        >
                          <span className="text-base font-bold text-gray-900">{t.portfolioPnl[locale]}</span>
                          <ChevronDown className={`h-5 w-5 text-ink/30 transition-transform duration-200 ${pnlOpen ? "rotate-180" : ""}`} />
                        </button>
                        {pnlOpen && (
                          <div className="mt-1 space-y-2">
                            {totalPnl !== null && totalPnl !== undefined && (
                              <div className={`rounded-lg p-3 ${totalPnl >= 0 ? "bg-emerald-50 border border-emerald-100" : "bg-red-50 border border-red-100"}`}>
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1">
                                    {totalPnl >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500" /> : <TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                                    <span className={`text-lg font-black ${totalPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                      {totalPnlPercent !== null && totalPnlPercent !== undefined
                                        ? `${totalPnl >= 0 ? "+" : ""}${totalPnlPercent.toFixed(1)}%`
                                        : `${totalPnl >= 0 ? "+" : ""}$${totalPnl.toFixed(2)}`}
                                    </span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <p className="text-[10px] text-gray-900 font-semibold mb-0.5">{t.costBasis[locale]}</p>
                                    <p className="text-base font-black text-gray-900">${totalCostBasis.toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-gray-900 font-semibold mb-0.5">{t.currentValue[locale]}</p>
                                    <p className="text-base font-black text-gray-900">${(totalCostBasis + totalPnl).toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <p className="text-[10px] text-gray-900 font-semibold mb-0.5">{t.unrealizedPnl[locale]}</p>
                                    <p className={`text-base font-black ${totalPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                      {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)} $
                                    </p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {treasuryHistory && (
                              <div className="rounded-lg border border-gray-100 p-2.5">
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-xs font-bold text-gray-900">{t.walletPerformance[locale]}</span>
                                  <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                                    {["24h", "7d", "30d", "1y", "all"].map((p) => (
                                      <button
                                        key={p}
                                        onClick={() => setPerfPeriod(p)}
                                        className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md transition-all ${perfPeriod === p ? "bg-white text-gray-900 shadow-sm" : "text-gray-400 hover:text-gray-600"}`}
                                      >
                                        {(t as any)[`perf${p === "24h" ? "24h" : p === "7d" ? "7d" : p === "30d" ? "30d" : p === "1y" ? "1y" : "All"}`]?.[locale] || p}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                {treasuryHistory.performance?.[perfPeriod] ? (
                                  <div className="flex items-center gap-2">
                                    <span className={`text-lg font-black ${treasuryHistory.performance[perfPeriod].changePercent >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                      {treasuryHistory.performance[perfPeriod].changePercent >= 0 ? "+" : ""}{treasuryHistory.performance[perfPeriod].changePercent.toFixed(2)}%
                                    </span>
                                    <span className="text-[10px] text-gray-400">
                                      (${treasuryHistory.performance[perfPeriod].totalUsd.toFixed(2)} → ${(treasuryHistory.performance[perfPeriod].currentTotalUsd || treasuryHistory.currentTotalUsd)?.toFixed(2)})
                                    </span>
                                  </div>
                                ) : (
                                  <p className="text-[10px] text-gray-400">—</p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mb-2">
                      <button
                        onClick={() => setChartOpen(!chartOpen)}
                        className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-slate-50/50 transition-colors"
                      >
                        <span className="text-base font-bold text-gray-900">{locale === "fr" ? "Répartition" : "Breakdown"}</span>
                        <ChevronDown className={`h-5 w-5 text-ink/30 transition-transform duration-200 ${chartOpen ? "rotate-180" : ""}`} />
                      </button>
                      {chartOpen && (
                        <div className="mt-1">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="flex items-center justify-center">
                              <div className="w-full aspect-square">
                                <ResponsiveContainer width="100%" height="100%">
                                  <PieChart>
                                    <Pie
                                      data={pieData}
                                      cx="50%"
                                      cy="50%"
                                      innerRadius="35%"
                                      outerRadius="70%"
                                      paddingAngle={2}
                                      dataKey="value"
                                      label={({ cx, cy, midAngle, innerRadius, outerRadius, index }: any) => {
                                        const RADIAN = Math.PI / 180;
                                        const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
                                        const x = cx + radius * Math.cos(-midAngle * RADIAN);
                                        const y = cy + radius * Math.sin(-midAngle * RADIAN);
                                        const h = allHoldings[index];
                                        if (!h) return null;
                                        return (
                                          <g>
                                            <text x={x} y={y - 5} fill="white" textAnchor="middle" fontSize={12} fontWeight="bold">{h.symbol}</text>
                                            <text x={x} y={y + 11} fill="white" textAnchor="middle" fontSize={11} fontWeight="bold">
                                              ${h.valueUsd.toFixed(0)}
                                            </text>
                                          </g>
                                        );
                                      }}
                                      labelLine={false}
                                    >
                                      {pieData.map((entry, i) => (
                                        <Cell key={i} fill={entry.color} stroke="white" strokeWidth={2} />
                                      ))}
                                    </Pie>
                                    <Tooltip
                                      content={({ active, payload }: any) => {
                                        if (!active || !payload?.length) return null;
                                        const d = payload[0].payload;
                                        const h = allHoldings.find((hh) => hh.symbol === d.name);
                                        return (
                                          <div className="bg-white rounded-xl border border-gray-100 shadow-lg p-2.5 flex items-center gap-2.5">
                                            {h?.iconUrl ? (
                                              <img src={h.iconUrl} alt={h.symbol} className="h-7 w-7 rounded-full" />
                                            ) : (
                                              <div className="h-7 w-7 rounded-full flex items-center justify-center" style={{ backgroundColor: d.color + "30" }}>
                                                <span className="text-[10px] font-bold" style={{ color: d.color }}>{d.name}</span>
                                              </div>
                                            )}
                                            <div>
                                              <p className="font-bold text-gray-900 text-sm">{d.name}</p>
                                              <p className="text-base font-black text-gray-900">${Number(d.value).toFixed(2)}</p>
                                            </div>
                                          </div>
                                        );
                                      }}
                                    />
                                  </PieChart>
                                </ResponsiveContainer>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              {allHoldings
                                .sort((a, b) => b.valueUsd - a.valueUsd)
                                .map((h) => {
                                  const pct = grandTotal > 0 ? ((h.valueUsd / grandTotal) * 100) : 0;
                                  const hasAcq = h.acquisitionPrice !== null && h.acquisitionPrice !== undefined;
                                  const acqP = h.acquisitionPrice ?? -1;
                                  const tokenPnl = hasAcq && acqP > 0 ? ((h.price - acqP) / acqP) * 100 : (hasAcq && acqP === 0 ? 100 : null);
                                  const tokenPerfVal = treasuryHistory?.perToken?.[h.symbol]?.[perfPeriod];
                                  return (
                                    <div key={h.symbol} className="flex items-center gap-2.5 py-2 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                                      {h.iconUrl ? (
                                        <img src={h.iconUrl} alt={h.symbol} className="h-8 w-8 rounded-full flex-shrink-0" />
                                      ) : (
                                        <div className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: h.color + "20" }}>
                                          <span className="text-xs font-bold" style={{ color: h.color }}>{h.symbol.slice(0, 2)}</span>
                                        </div>
                                      )}
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                          <div className="flex items-center gap-1.5">
                                            <span className="text-base font-black text-gray-900">{h.symbol}</span>
                                            {tokenPnl !== null && (
                                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tokenPnl >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
                                                {tokenPnl >= 0 ? "+" : ""}{tokenPnl.toFixed(1)}%
                                              </span>
                                            )}
                                            {tokenPerfVal !== undefined && (
                                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tokenPerfVal >= 0 ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                                                {perfPeriod}: {tokenPerfVal >= 0 ? "+" : ""}{tokenPerfVal.toFixed(1)}%
                                              </span>
                                            )}
                                          </div>
                                          <span className="text-base font-black text-gray-900">${h.valueUsd.toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center justify-between mt-0.5">
                                          <span className="text-sm font-semibold text-gray-900">
                                            {h.balance < 1 ? h.balance.toFixed(6) : h.balance.toFixed(2)} @ ${h.price < 1 ? h.price.toFixed(4) : h.price.toFixed(2)}
                                          </span>
                                          <span className="text-sm font-semibold text-gray-900">{pct.toFixed(1)}%</span>
                                        </div>
                                        {hasAcq && (
                                          <div className="flex items-center justify-between mt-0.5">
                                            <span className="text-sm font-semibold text-gray-900">
                                              {t.acquisitionPrice[locale]}: ${h.acquisitionPrice === 0 ? "0.00" : (h.acquisitionPrice! < 1 ? h.acquisitionPrice!.toFixed(4) : h.acquisitionPrice!.toFixed(2))}
                                            </span>
                                            <span className={`text-sm font-bold ${tokenPnl !== null && tokenPnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                                              {tokenPnl !== null ? `${tokenPnl >= 0 ? "+" : ""}$${(h.valueUsd - (h.acquisitionPrice || 0) * h.balance).toFixed(2)}` : ""}
                                            </span>
                                          </div>
                                        )}
                                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: h.color }} />
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {treasury && (
                      <p className="text-[10px] text-ink/30 mt-3 text-center">
                        {t.ethTreasury[locale]}: {shortenAddress(treasury.address)} (Ethereum) • CRC: {shortenAddress(data.treasuryAddress)} (Gnosis)
                      </p>
                    )}
                  </div>
                );
              }
              return null;
            })()}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-4">
                <Accordion
                  title={t.topContributors[locale]}
                  icon={<Trophy className="h-5 w-5 text-amber-500" />}
                  badge={data.contributions.length}
                  defaultOpen
                >
                  <p className="text-xs text-ink/40 mb-3">
                    {t.contributorsDesc[locale]}
                  </p>
                  {data.contributions.length === 0 ? (
                    <p className="text-sm text-ink/40 py-8 text-center">{t.noContributions[locale]}</p>
                  ) : (
                    <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                      {data.contributions.map((contrib, idx) => (
                        <div key={contrib.address} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors">
                          <span className="text-sm font-bold text-ink/20 w-6 text-right flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <ProfileAvatar address={contrib.address} profiles={profiles} size="sm" />
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-amber-600">
                              {contrib.totalCRC.toFixed(2)} <span className="text-[10px] font-normal text-ink/40">CRC</span>
                            </p>
                            {contrib.lastContributionTs > 0 && (
                              <p className="text-[10px] text-ink/30">
                                {formatTimeAgo(contrib.lastContributionTs, locale)}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Accordion>

                <Accordion
                  title={t.weeklyTop[locale]}
                  icon={<Star className="h-5 w-5 text-yellow-500" />}
                  badge={data.weeklyContributions.length}
                  defaultOpen
                >
                  <p className="text-xs text-ink/40 mb-3">
                    {t.weeklyTopDesc[locale]}
                  </p>
                  {data.weeklyContributions.length === 0 ? (
                    <p className="text-sm text-ink/40 py-8 text-center">{t.noWeeklyContributions[locale]}</p>
                  ) : (
                    <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                      {data.weeklyContributions.map((contrib, idx) => (
                        <div key={contrib.address} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors">
                          <span className="text-sm font-bold text-ink/20 w-6 text-right flex-shrink-0">
                            {idx + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <ProfileAvatar address={contrib.address} profiles={profiles} size="sm" />
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-yellow-600">
                              {contrib.weeklyCRC.toFixed(2)} <span className="text-[10px] font-normal text-ink/40">CRC</span>
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Accordion>

                <Accordion
                  title={t.latestClaims[locale]}
                  icon={<Clock className="h-5 w-5 text-emerald-500" />}
                  badge={data.latestClaims.length}
                  defaultOpen
                >
                  <p className="text-xs text-ink/40 mb-3">
                    {t.latestClaimsDesc[locale]}
                  </p>
                  {data.latestClaims.length === 0 ? (
                    <p className="text-sm text-ink/40 py-8 text-center">{t.noContributions[locale]}</p>
                  ) : (
                    <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                      {data.latestClaims.map((claim, idx) => (
                        <div key={`${claim.address}-${claim.timestamp}-${idx}`} className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors">
                          <div className="flex-1 min-w-0">
                            <ProfileAvatar address={claim.address} profiles={profiles} size="sm" />
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-bold text-emerald-600">
                              +{claim.amount.toFixed(2)} <span className="text-[10px] font-normal text-ink/40">CRC</span>
                            </p>
                            <p className="text-[10px] text-ink/30">
                              {formatTimeAgo(claim.timestamp, locale)}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Accordion>
              </div>

              <div className="space-y-4">
                <Accordion
                  title={t.members[locale]}
                  icon={<Users className="h-5 w-5 text-emerald-500" />}
                  badge={data.totalMembers}
                  defaultOpen
                >
                  <p className="text-xs text-ink/40 mb-3">
                    {data.totalMembers} {t.totalMembers[locale]}
                  </p>
                  <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                    {data.members.map((addr) => {
                      const trust = data.memberTrust[addr];
                      return (
                        <div key={addr} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors">
                          <ProfileAvatar address={addr} profiles={profiles} size="sm" />
                          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                            {trust?.trustedByGroup && trust?.trustsGroup ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">{t.mutual[locale]}</span>
                            ) : trust?.trustedByGroup ? (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">{t.trustedByGroup[locale]}</span>
                            ) : (
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">{t.trustsGroup[locale]}</span>
                            )}
                            <a
                              href={`https://circles.garden/profile/${addr}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-ink/20 hover:text-ink/50 transition-colors"
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Accordion>

                <Accordion
                  title={t.inactiveMembers[locale]}
                  icon={<UserX className="h-5 w-5 text-red-400" />}
                  badge={totalInactive}
                  defaultOpen
                >
                  <InactiveFilter locale={locale} selected={inactiveFilter} onChange={setInactiveFilter} />
                  {(() => {
                    const filtered = getFilteredInactive();
                    const contribMap = new Map(
                      data.contributions.map((c) => [c.address, c])
                    );
                    if (filtered.length === 0) {
                      return (
                        <div className="py-6 text-center text-sm text-ink/40 flex items-center justify-center gap-2">
                          <CheckCircle className="h-4 w-4 text-emerald-400" />
                          {t.allActive[locale]}
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                        {filtered.map((addr) => {
                          const contrib = contribMap.get(addr);
                          return (
                            <div key={addr} className="flex items-center justify-between py-2 px-3 rounded-xl bg-red-50/30 hover:bg-red-50/60 transition-colors">
                              <div className="flex items-center gap-2 min-w-0">
                                <XCircle className="h-3.5 w-3.5 text-red-300 flex-shrink-0" />
                                <ProfileAvatar address={addr} profiles={profiles} size="sm" />
                              </div>
                              <div className="text-right flex-shrink-0 ml-2">
                                {contrib && contrib.lastContributionTs > 0 ? (
                                  <p className="text-[10px] text-ink/30">
                                    {t.lastContribution[locale]}: {formatTimeAgo(contrib.lastContributionTs, locale)}
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-red-400 font-medium">
                                    {t.never[locale]}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </Accordion>
              </div>
            </div>

            <footer className="text-center space-y-2 pt-4 pb-8">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-ink/30">
                <span>
                  {t.groupAddress[locale]}:{" "}
                  <a href={`https://gnosisscan.io/address/${data.groupAddress}`} target="_blank" rel="noopener noreferrer" className="font-mono hover:text-ink/50 transition-colors">
                    {shortenAddress(data.groupAddress)}
                  </a>
                </span>
                <span className="hidden sm:inline">|</span>
                <span>
                  {t.treasuryAddress[locale]}:{" "}
                  <a href={`https://gnosisscan.io/address/${data.treasuryAddress}`} target="_blank" rel="noopener noreferrer" className="font-mono hover:text-ink/50 transition-colors">
                    {shortenAddress(data.treasuryAddress)}
                  </a>
                </span>
              </div>
              {data.fetchedAt && (
                <p className="text-[10px] text-ink/20">
                  {t.lastUpdate[locale]}: {new Date(data.fetchedAt).toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-US")}
                </p>
              )}
            </footer>
          </div>
        )}
      </div>
    </main>
  );
}

function formatTimeAgo(ts: number, locale: "fr" | "en"): string {
  const now = Date.now() / 1000;
  const diff = now - ts;
  const days = Math.floor(diff / 86400);
  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor(diff / 60);

  if (locale === "fr") {
    if (days > 60) return `il y a ${Math.floor(days / 30)} mois`;
    if (days > 30) return `il y a 1 mois`;
    if (days > 0) return `il y a ${days}j`;
    if (hours > 0) return `il y a ${hours}h`;
    if (minutes > 0) return `il y a ${minutes}min`;
    return "maintenant";
  }
  if (days > 60) return `${Math.floor(days / 30)}mo ago`;
  if (days > 30) return `1mo ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "now";
}

function StatCard({ icon, value, label, sub }: { icon: React.ReactNode; value: number | string; label: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-ink/5 bg-white p-4 shadow-sm flex items-center gap-3">
      <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">{icon}</div>
      <div>
        <p className="text-xl font-bold text-ink">{value}</p>
        {sub && <p className="text-xs font-semibold text-green-600">{sub}</p>}
        <p className="text-[10px] text-ink/40">{label}</p>
      </div>
    </div>
  );
}
