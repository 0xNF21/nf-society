"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations, localeBcp47 } from "@/lib/i18n";
import { formatCrc } from "@/lib/format";
import BadgeIcon from "@/components/ui/badge-icon";

interface LevelDef {
  level: number;
  name: string;
  xpRequired: number;
}

interface BadgeData {
  slug: string;
  name: string;
  description: string;
  icon: string;
  iconType: string;
  category: string;
  secret: boolean;
  earned: boolean;
  earnedAt: string | null;
}

interface GameStat {
  game: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

interface HistoryEntry {
  game: string;
  slug: string;
  opponent: string | null;
  result: "win" | "loss" | "draw";
  betCrc: number;
  date: string;
}

interface StatsData {
  totalGames: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  totalBet: number;
  totalWon: number;
  byGame: GameStat[];
  history: HistoryEntry[];
}

interface PrivacyFlags {
  hidePnl: boolean;
  hideTotalBet: boolean;
  hideXpSpent: boolean;
  hideGameHistory: boolean;
  hideFromLeaderboard: boolean;
  hideFromSearch: boolean;
}

interface FullGameStat {
  key: string;
  label: string;
  emoji: string;
  type: "multi" | "chance";
  played: number;
  wagered: number;
  won: number;
  net: number;
  winRate?: number;
  wins?: number;
  losses?: number;
  draws?: number;
  lastPlayedAt: string | null;
}

interface Props {
  address: string;
  name: string;
  avatar: string | null;
  xp: number;
  level: number;
  levelName: string;
  toNext: number;
  progressPct: number;
  streak: number;
  levels: LevelDef[];
  badges: BadgeData[];
  stats: StatsData;
  gamesBreakdown: FullGameStat[];
  privacy?: PrivacyFlags;
}

const CATEGORY_ORDER = ["event", "game", "activity", "secret"];
const CATEGORY_LABELS: Record<string, { fr: string; en: string }> = {
  event: { fr: "Événements", en: "Events" },
  game: { fr: "Jeu", en: "Game" },
  activity: { fr: "Activité", en: "Activity" },
  secret: { fr: "Secrets", en: "Secrets" },
};

function CollapsibleSection({ title, defaultOpen = false, count, children }: {
  title: string;
  defaultOpen?: boolean;
  count?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-ink/10 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-ink/[0.02] transition-colors"
      >
        <span className="text-xs text-ink/40 font-bold uppercase tracking-widest">{title}</span>
        <div className="flex items-center gap-2">
          {count && <span className="text-xs text-ink/30 font-semibold">{count}</span>}
          <ChevronDown className={`h-4 w-4 text-ink/30 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

import { GAME_LABELS, GAME_ICONS } from "@/lib/game-registry";

const RESULT_COLORS: Record<string, string> = {
  win: "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-900/30",
  loss: "text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-900/30",
  draw: "text-ink/50 bg-ink/5 dark:text-ink/40 dark:bg-ink/10",
};

export default function PlayerProfileClient({
  address, name, avatar, xp, level, levelName, toNext, progressPct, streak, levels, badges, stats, gamesBreakdown, privacy,
}: Props) {
  const { locale } = useLocale();
  const t = translations.playerProfile;
  const tp = translations.privacy;
  const hidePnl = privacy?.hidePnl ?? false;
  const hideTotalBet = privacy?.hideTotalBet ?? false;
  const hideGameHistory = privacy?.hideGameHistory ?? false;

  const supremeBadge = badges.find(b => b.slug === "supreme_founder" && b.earned);
  const otherBadges = badges.filter(b => b.slug !== "supreme_founder");
  const groupedBadges = CATEGORY_ORDER.map(cat => ({
    category: cat,
    label: CATEGORY_LABELS[cat]?.[locale] ?? cat,
    items: otherBadges.filter(b => b.category === cat),
  })).filter(g => g.items.length > 0);

  const earnedCount = badges.filter(b => b.earned).length;
  const totalVisible = badges.filter(b => !b.secret || b.earned).length;

  return (
    <div className="min-h-screen bg-sand">
      <main className="mx-auto max-w-lg px-4 py-10 flex flex-col gap-4">
        <Link href="/hub" className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink/80 transition-colors font-medium w-fit">
          <ArrowLeft className="h-3.5 w-3.5" />
          {t.home[locale]}
        </Link>

        {/* Card profil — avatar Circles + nom */}
        <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-ink/10 shadow-sm p-6 flex items-center gap-4">
          {avatar ? (
            <img src={avatar} alt={name} className="h-16 w-16 rounded-full object-cover shadow ring-2 ring-ink/5" />
          ) : (
            <div className="h-16 w-16 rounded-full bg-marine/10 flex items-center justify-center shadow ring-2 ring-ink/5">
              <span className="text-2xl font-black text-marine">{name.slice(0, 2).toUpperCase()}</span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-lg font-bold text-ink truncate">{name}</p>
            <p className="text-xs font-mono text-ink/30 truncate">{address}</p>
            {supremeBadge && (
              <div className="mt-1.5 flex items-center gap-1.5">
                <BadgeIcon icon={supremeBadge.icon} iconType={supremeBadge.iconType} size={18} />
                <span className="text-xs font-bold text-amber-600">{supremeBadge.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Supreme founder badge — grand format */}
        {supremeBadge && (
          <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 shadow-sm">
            <div className="flex items-center justify-center w-16 h-16 rounded-xl bg-amber-100 shadow-inner">
              <BadgeIcon icon={supremeBadge.icon} iconType={supremeBadge.iconType} size={44} />
            </div>
            <div>
              <p className="font-bold text-ink text-lg">{supremeBadge.name}</p>
              <p className="text-sm text-ink/50">{supremeBadge.description}</p>
            </div>
          </div>
        )}

        {/* Level + XP — collapsible */}
        <CollapsibleSection
          title={`${t.level[locale]} & XP`}
          defaultOpen={true}
          count={`Lv.${level}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-black text-marine">{level}</p>
              <p className="text-sm font-semibold text-ink/60">{levelName}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-ink/40 font-bold uppercase tracking-widest">{t.totalXp[locale]}</p>
              <p className="text-3xl font-black text-ink">{xp.toLocaleString()}</p>
            </div>
          </div>

          {/* Barre de progression */}
          <div>
            <div className="flex justify-between text-xs text-ink/40 mb-1.5">
              <span>{levelName}</span>
              {level < 10 ? (
                <span>{toNext} {t.xpToNext[locale]} {level + 1}</span>
              ) : (
                <span>{t.maxLevel[locale]}</span>
              )}
            </div>
            <div className="h-3 rounded-full bg-ink/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(progressPct, 100)}%`,
                  background: "linear-gradient(90deg, #251B9F, #FF491B)",
                }}
              />
            </div>
            <p className="text-xs text-ink/30 mt-1 text-right">{progressPct}%</p>
          </div>

          {/* Streak */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-ink/[0.03] border border-ink/5">
            <span className="text-2xl">🔥</span>
            <div>
              <p className="text-xs text-ink/40 font-bold uppercase tracking-widest">{t.dailyStreak[locale]}</p>
              <p className="text-lg font-black text-citrus">{streak} {streak > 1 ? t.daysPlural[locale] : t.days[locale]}</p>
            </div>
            {streak >= 7 && (
              <p className="text-xs font-semibold text-citrus/70 ml-auto">{t.bonus7days[locale]}</p>
            )}
          </div>
        </CollapsibleSection>

        {/* Statistiques — collapsible */}
        <CollapsibleSection
          title={t.stats[locale]}
          defaultOpen={true}
          count={stats.totalGames > 0 ? `${stats.winRate}% WR` : "—"}
        >
          {stats.totalGames === 0 ? (
            <p className="text-sm text-ink/40 text-center py-4">{t.noGames[locale]}</p>
          ) : (
            <div className="space-y-4">
              {/* Stats globales */}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5 p-3 text-center">
                  <p className="text-2xl font-black text-ink dark:text-white">{stats.totalGames}</p>
                  <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">{t.gamesPlayed[locale]}</p>
                </div>
                <div className="rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5 p-3 text-center">
                  <p className="text-2xl font-black text-marine dark:text-blue-400">{stats.winRate}%</p>
                  <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">{t.winRate[locale]}</p>
                </div>
                <div className="rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5 p-3 text-center">
                  <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{stats.wins}</p>
                  <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">{t.victories[locale]}</p>
                </div>
                <div className="rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5 p-3 text-center">
                  <p className="text-lg font-black text-red-500 dark:text-red-400">{stats.losses}</p>
                  <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">{t.defeats[locale]}</p>
                </div>
              </div>

              {/* CRC misés / gagnés */}
              <div className="flex justify-between items-center px-3 py-2 rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5">
                <div className="text-center flex-1">
                  {hideTotalBet ? (
                    <p className="text-sm font-black text-ink/40">🔒 {tp.private[locale]}</p>
                  ) : (
                    <p className="text-sm font-black text-ink dark:text-white">{stats.totalBet} CRC</p>
                  )}
                  <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">{t.crcBet[locale]}</p>
                </div>
                <div className="w-px h-8 bg-ink/10" />
                <div className="text-center flex-1">
                  {hidePnl ? (
                    <p className="text-sm font-black text-ink/40">🔒 {tp.private[locale]}</p>
                  ) : (
                    <p className={`text-sm font-black ${stats.totalWon >= stats.totalBet ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>{stats.totalWon} CRC</p>
                  )}
                  <p className="text-[10px] font-bold text-ink/40 uppercase tracking-widest">{t.crcWon[locale]}</p>
                </div>
              </div>

              {/* Par jeu — dynamique (multi + chance), tri activite recente */}
              {gamesBreakdown.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest">{t.byGame[locale]}</p>
                  {gamesBreakdown.map(g => (
                    <div key={g.key} className="flex items-center justify-between px-3 py-2 rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm">{g.emoji}</span>
                        <span className="text-sm font-semibold text-ink dark:text-white truncate">{g.label}</span>
                        <span className="text-[9px] uppercase tracking-wider text-ink/30 dark:text-white/30 font-bold">
                          {g.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs shrink-0">
                        <span className="text-ink/50">{g.played} {t.games[locale]}</span>
                        {g.type === "multi" && g.winRate !== undefined ? (
                          <>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">{g.wins}W</span>
                            <span className="font-bold text-red-500 dark:text-red-400">{g.losses}L</span>
                            <span className="font-bold text-marine dark:text-blue-400">{g.winRate}%</span>
                          </>
                        ) : (
                          <span className={`font-bold font-mono ${g.net >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>
                            {g.net >= 0 ? "+" : ""}{formatCrc(g.net)} CRC
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Historique récent */}
              {hideGameHistory ? (
                <div className="flex items-center justify-center gap-2 py-3 px-3 rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5">
                  <span className="text-xs text-ink/40">🔒 {tp.historyHidden[locale]}</span>
                </div>
              ) : stats.history.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest">{t.recentHistory[locale]}</p>
                  <div className="space-y-1.5 max-h-80 overflow-y-auto">
                    {stats.history.map((h, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="text-xs">{GAME_ICONS[h.game]}</span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink dark:text-white truncate">
                              {GAME_LABELS[h.game]} {h.opponent ? `${t.vs[locale]} ${h.opponent.slice(0, 6)}…${h.opponent.slice(-4)}` : ""}
                            </p>
                            <p className="text-[10px] text-ink/30">{new Date(h.date).toLocaleDateString(localeBcp47(locale), { day: "numeric", month: "short" })}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-ink/40">{h.betCrc} CRC</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${RESULT_COLORS[h.result]}`}>
                            {t[h.result][locale]}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CollapsibleSection>

        {/* Transactions — lazy loaded */}
        <TransactionHistory address={address} locale={locale} />

        {/* Badges — collapsible */}
        <CollapsibleSection
          title="Badges"
          defaultOpen={true}
          count={`${earnedCount}/${totalVisible}`}
        >
          {groupedBadges.map(({ category, label, items }) => (
            <div key={category} className="space-y-2">
              <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest">{label}</p>
              <div className="grid grid-cols-3 gap-2">
                {items.map((badge) => (
                  <div
                    key={badge.slug}
                    className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                      badge.earned
                        ? "border-ink/10 bg-white/80"
                        : "border-ink/5 bg-ink/[0.02] opacity-40"
                    }`}
                    title={badge.earned ? badge.description : "???"}
                  >
                    <div className={`flex items-center justify-center w-10 h-10 rounded-xl ${
                      badge.earned ? "bg-ink/5" : "bg-ink/5 grayscale"
                    }`}>
                      <BadgeIcon icon={badge.icon} iconType={badge.iconType} size={28} />
                    </div>
                    <p className={`text-[10px] font-semibold text-center leading-tight ${
                      badge.earned ? "text-ink/70" : "text-ink/30"
                    }`}>
                      {badge.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CollapsibleSection>

        {/* Paliers XP — collapsible */}
        <CollapsibleSection title={t.xpTiers[locale]} count={`${level}/10`}>
          <div className="space-y-1">
            {levels.map((l) => (
              <div key={l.level} className={`flex items-center justify-between py-2 px-3 rounded-xl ${l.level === level ? "bg-marine/8 border border-marine/20" : "bg-transparent"}`}>
                <span className={`text-sm font-bold ${l.level <= level ? "text-marine" : "text-ink/30"}`}>
                  {l.level <= level ? "✓" : "○"} {l.name}
                </span>
                <span className="text-xs font-semibold text-ink/40">{l.xpRequired.toLocaleString()} XP</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </main>
    </div>
  );
}

/* ─── Transaction History ─── */

type Tx = { type: "in" | "out"; amount: number; label: string; category: string; date: string };

function TransactionHistory({ address, locale }: { address: string; locale: "fr" | "en" }) {
  const t = translations.playerProfile;
  const [txs, setTxs] = useState<Tx[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  function load() {
    if (loaded) { setOpen(!open); return; }
    setOpen(true);
    setLoading(true);
    fetch(`/api/players/${address}/transactions`)
      .then(r => r.json())
      .then(d => { setTxs(d.transactions || []); setLoaded(true); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  const totalIn = txs.filter(t => t.type === "in").reduce((s, t) => s + t.amount, 0);
  const totalOut = txs.filter(t => t.type === "out").reduce((s, t) => s + t.amount, 0);

  return (
    <div className="rounded-2xl bg-white/70 backdrop-blur-sm border border-ink/10 shadow-sm overflow-hidden">
      <button onClick={load}
        className="w-full flex items-center justify-between p-5 text-left hover:bg-ink/[0.02] transition-colors">
        <span className="text-xs text-ink/40 font-bold uppercase tracking-widest">
          {t.transactionsTitle[locale]}
        </span>
        <div className="flex items-center gap-2">
          {loaded && <span className="text-xs text-ink/30 font-semibold">{txs.length}</span>}
          <ChevronDown className={`h-4 w-4 text-ink/30 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3">
          {loading && <p className="text-center text-xs text-ink/40 py-4">{t.loading[locale]}</p>}

          {loaded && txs.length === 0 && (
            <p className="text-center text-xs text-ink/40 py-4">{t.noTransactions[locale]}</p>
          )}

          {loaded && txs.length > 0 && (
            <>
              {/* Summary */}
              <div className="flex gap-2">
                <div className="flex-1 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-2 text-center">
                  <p className="text-sm font-bold text-emerald-600">+{Math.round(totalIn * 1000) / 1000} CRC</p>
                  <p className="text-[10px] text-emerald-600/60">{t.received[locale]}</p>
                </div>
                <div className="flex-1 rounded-xl bg-red-50 dark:bg-red-900/20 p-2 text-center">
                  <p className="text-sm font-bold text-red-500">-{Math.round(totalOut * 1000) / 1000} CRC</p>
                  <p className="text-[10px] text-red-500/60">{t.spent[locale]}</p>
                </div>
              </div>

              {/* List */}
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {txs.map((tx, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className={`text-sm ${tx.type === "in" ? "text-emerald-500" : "text-red-400"}`}>
                        {tx.type === "in" ? "📥" : "📤"}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs text-ink dark:text-white truncate">{tx.label}</p>
                        <p className="text-[10px] text-ink/30">
                          {new Date(tx.date).toLocaleDateString(localeBcp47(locale), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold whitespace-nowrap ${tx.type === "in" ? "text-emerald-600" : "text-red-500"}`}>
                      {tx.type === "in" ? "+" : "-"}{tx.amount} CRC
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
