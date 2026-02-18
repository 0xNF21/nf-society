"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BarChart3,
  Users,
  Network,
  Trophy,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  CheckCircle,
  XCircle,
  UserX,
} from "lucide-react";
import { useLocale, LanguageSwitcher } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

type DaoData = {
  groupAddress: string;
  treasuryAddress: string;
  members: string[];
  memberTrust: Record<string, { trustedByGroup: boolean; trustsGroup: boolean }>;
  memberRelations: Array<{ from: string; to: string }>;
  contributions: Array<{
    address: string;
    totalAmount: number;
    lastContribution: string;
    count: number;
  }>;
  totalMembers: number;
};

type Profile = {
  name?: string;
  avatarUrl?: string;
};

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
  size?: "sm" | "md" | "lg";
}) {
  const profile = profiles[address.toLowerCase()];
  const sizeClass = size === "lg" ? "h-10 w-10" : size === "md" ? "h-8 w-8" : "h-6 w-6";
  const textSize = size === "lg" ? "text-sm" : size === "md" ? "text-xs" : "text-[10px]";

  return (
    <div className="flex items-center gap-2 min-w-0">
      {profile?.avatarUrl ? (
        <img
          src={profile.avatarUrl}
          alt=""
          className={`${sizeClass} rounded-full object-cover flex-shrink-0`}
        />
      ) : (
        <div
          className={`${sizeClass} rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0`}
        >
          <span className={`${textSize} font-bold text-emerald-600`}>
            {address.slice(2, 4).toUpperCase()}
          </span>
        </div>
      )}
      <span className="truncate text-sm font-medium text-ink">
        {profile?.name || shortenAddress(address)}
      </span>
    </div>
  );
}

export default function DashboardDaoPage() {
  const { locale } = useLocale();
  const t = translations.dao;

  const [data, setData] = useState<DaoData | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/dao");
        if (!res.ok) throw new Error("API error");
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        if (cancelled) return;
        setData(json);
        setLoading(false);

        const allAddresses = new Set<string>();
        (json.members || []).forEach((m: string) => allAddresses.add(m));
        (json.contributions || []).forEach((c: any) => allAddresses.add(c.address));
        const addressList = [...allAddresses];

        if (addressList.length > 0 && !cancelled) {
          const batchSize = 30;
          for (let i = 0; i < addressList.length; i += batchSize) {
            if (cancelled) return;
            const batch = addressList.slice(i, i + batchSize);
            try {
              const profileRes = await fetch("/api/profiles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ addresses: batch }),
              });
              if (profileRes.ok && !cancelled) {
                const profileData = await profileRes.json();
                setProfiles((prev) => ({ ...prev, ...(profileData.profiles || {}) }));
              }
            } catch {}
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || "Unknown error");
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const contributorSet = new Set(
    data?.contributions?.map((c) => c.address.toLowerCase()) || []
  );
  const inactiveMembers =
    data?.members.filter((m) => !contributorSet.has(m.toLowerCase())) || [];

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-ink/40 hover:text-ink/70 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.back[locale]}
          </Link>
          <LanguageSwitcher />
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
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-600 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              {t.retry[locale]}
            </button>
          </div>
        )}

        {data && !loading && (
          <div className="space-y-8">
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                icon={<Users className="h-5 w-5 text-emerald-500" />}
                value={data.totalMembers}
                label={t.members[locale]}
              />
              <StatCard
                icon={<Network className="h-5 w-5 text-blue-500" />}
                value={data.memberRelations.length}
                label={t.trustRelations[locale]}
              />
              <StatCard
                icon={<Trophy className="h-5 w-5 text-amber-500" />}
                value={data.contributions.length}
                label={t.totalContributions[locale]}
              />
            </div>

            <div className="grid gap-8 lg:grid-cols-2">
              <section className="rounded-2xl border border-ink/5 bg-white p-6 shadow-sm">
                <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2 mb-1">
                  <Users className="h-5 w-5 text-emerald-500" />
                  {t.members[locale]}
                </h2>
                <p className="text-xs text-ink/40 mb-4">
                  {data.totalMembers} {t.totalMembers[locale]}
                </p>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {data.members.map((addr) => {
                    const trust = data.memberTrust[addr];
                    return (
                      <div
                        key={addr}
                        className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        <ProfileAvatar address={addr} profiles={profiles} size="sm" />
                        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                          {trust?.trustedByGroup && trust?.trustsGroup ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-medium">
                              {t.mutual[locale]}
                            </span>
                          ) : trust?.trustedByGroup ? (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                              {t.trustedByGroup[locale]}
                            </span>
                          ) : (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 font-medium">
                              {t.trustsGroup[locale]}
                            </span>
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
              </section>

              <section className="rounded-2xl border border-ink/5 bg-white p-6 shadow-sm">
                <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2 mb-1">
                  <Trophy className="h-5 w-5 text-amber-500" />
                  {t.topContributors[locale]}
                </h2>
                <p className="text-xs text-ink/40 mb-4">
                  {locale === "fr"
                    ? "Classement par nombre de transactions vers la trésorerie"
                    : "Ranked by number of transactions to treasury"}
                </p>
                {data.contributions.length === 0 ? (
                  <p className="text-sm text-ink/40 py-8 text-center">
                    {t.noContributions[locale]}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                    {data.contributions.map((contrib, idx) => (
                      <div
                        key={contrib.address}
                        className="flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-slate-50 transition-colors"
                      >
                        <span className="text-sm font-bold text-ink/30 w-6 text-right flex-shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <ProfileAvatar
                            address={contrib.address}
                            profiles={profiles}
                            size="sm"
                          />
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs font-semibold text-ink">
                            {contrib.count} {t.transactions[locale]}
                          </p>
                          {contrib.totalAmount > 0 && (
                            <p className="text-[10px] text-ink/40">
                              {contrib.totalAmount} CRC
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-2xl border border-ink/5 bg-white p-6 shadow-sm">
              <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2 mb-1">
                <Network className="h-5 w-5 text-blue-500" />
                {t.trustNetwork[locale]}
              </h2>
              <p className="text-xs text-ink/40 mb-4">
                {data.memberRelations.length} {t.trustRelations[locale]}
              </p>
              <TrustNetworkViz
                members={data.members}
                relations={data.memberRelations}
                profiles={profiles}
              />
            </section>

            <section className="rounded-2xl border border-ink/5 bg-white p-6 shadow-sm">
              <h2 className="font-display text-lg font-bold text-ink flex items-center gap-2 mb-1">
                <UserX className="h-5 w-5 text-red-400" />
                {t.inactiveMembers[locale]}
              </h2>
              <p className="text-xs text-ink/40 mb-4">
                {t.inactiveDesc[locale]} ({inactiveMembers.length})
              </p>
              {inactiveMembers.length === 0 ? (
                <div className="py-6 text-center text-sm text-ink/40 flex items-center justify-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                  {locale === "fr"
                    ? "Tous les membres ont contribué !"
                    : "All members have contributed!"}
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                  {inactiveMembers.map((addr) => (
                    <div
                      key={addr}
                      className="flex items-center gap-2 py-2 px-3 rounded-xl bg-red-50/50"
                    >
                      <XCircle className="h-3.5 w-3.5 text-red-300 flex-shrink-0" />
                      <ProfileAvatar address={addr} profiles={profiles} size="sm" />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <footer className="text-center space-y-2 pt-4 pb-8">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-xs text-ink/30">
                <span>
                  {t.groupAddress[locale]}:{" "}
                  <a
                    href={`https://gnosisscan.io/address/${data.groupAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono hover:text-ink/50 transition-colors"
                  >
                    {shortenAddress(data.groupAddress)}
                  </a>
                </span>
                <span className="hidden sm:inline">|</span>
                <span>
                  {t.treasuryAddress[locale]}:{" "}
                  <a
                    href={`https://gnosisscan.io/address/${data.treasuryAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono hover:text-ink/50 transition-colors"
                  >
                    {shortenAddress(data.treasuryAddress)}
                  </a>
                </span>
              </div>
            </footer>
          </div>
        )}
      </div>
    </main>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-ink/5 bg-white p-5 shadow-sm flex items-center gap-4">
      <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-ink">{value}</p>
        <p className="text-xs text-ink/40">{label}</p>
      </div>
    </div>
  );
}

function TrustNetworkViz({
  members,
  relations,
  profiles,
}: {
  members: string[];
  relations: Array<{ from: string; to: string }>;
  profiles: Record<string, Profile>;
}) {
  if (members.length === 0) return null;

  const connectionCount: Record<string, number> = {};
  for (const r of relations) {
    connectionCount[r.from] = (connectionCount[r.from] || 0) + 1;
    connectionCount[r.to] = (connectionCount[r.to] || 0) + 1;
  }

  const sorted = [...members].sort(
    (a, b) => (connectionCount[b] || 0) - (connectionCount[a] || 0)
  );

  const topN = 20;
  const top = sorted.slice(0, topN);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {top.map((addr) => {
          const count = connectionCount[addr] || 0;
          const maxCount = connectionCount[sorted[0]] || 1;
          const intensity = Math.max(0.2, count / maxCount);
          const profile = profiles[addr.toLowerCase()];
          return (
            <div
              key={addr}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-ink/5 bg-white shadow-sm hover:shadow-md transition-shadow"
              title={`${profile?.name || addr}: ${count} connections`}
              style={{
                borderColor: `rgba(16, 185, 129, ${intensity})`,
                backgroundColor: `rgba(16, 185, 129, ${intensity * 0.08})`,
              }}
            >
              {profile?.avatarUrl ? (
                <img
                  src={profile.avatarUrl}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center">
                  <span className="text-[8px] font-bold text-emerald-600">
                    {addr.slice(2, 4).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-xs font-medium text-ink truncate max-w-24">
                {profile?.name || shortenAddress(addr)}
              </span>
              <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 rounded-full px-1.5">
                {count}
              </span>
            </div>
          );
        })}
      </div>
      {members.length > topN && (
        <p className="text-xs text-ink/30 text-center">
          +{members.length - topN} more
        </p>
      )}
    </div>
  );
}
