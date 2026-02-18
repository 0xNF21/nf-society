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
} from "lucide-react";
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
      const res = await fetch("/api/crc-price");
      if (res.ok) {
        const json = await res.json();
        if (json.price) setCrcPrice(json.price);
      }
    } catch {}
  }

  async function loadData(isRefresh = false) {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const [res] = await Promise.all([fetch("/api/dao"), fetchCrcPrice()]);
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
