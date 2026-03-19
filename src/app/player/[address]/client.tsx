"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
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

export default function PlayerProfileClient({
  address, name, avatar, xp, level, levelName, toNext, progressPct, streak, levels, badges,
}: Props) {
  const { locale } = useLocale();
  const t = translations.playerProfile;

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
    <div className="min-h-screen bg-[#f7f4ee]">
      <main className="mx-auto max-w-lg px-4 py-10 flex flex-col gap-4">
        <Link href="/" className="flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink/80 transition-colors font-medium w-fit">
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
