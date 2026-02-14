"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Ticket } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

export type ParticipantEntry = {
  address: string;
  transactionHash: string;
  paidAt: string;
};

type CirclesProfile = {
  name: string;
  imageUrl: string | null;
};

function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-ink/5 bg-sand/20 px-3 py-2.5">
      <div className="h-8 w-8 rounded-full bg-ink/10 animate-pulse shrink-0" />
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="h-3.5 w-24 bg-ink/10 rounded animate-pulse" />
        <div className="h-2.5 w-20 bg-ink/5 rounded animate-pulse" />
      </div>
      <div className="h-3.5 w-12 bg-ink/10 rounded animate-pulse" />
    </div>
  );
}

export function TicketHistory({
  participants,
  loading,
  onRefresh,
  ticketPrice,
}: {
  participants: ParticipantEntry[];
  loading: boolean;
  onRefresh: () => void;
  ticketPrice?: number;
}) {
  const [profiles, setProfiles] = useState<Record<string, CirclesProfile>>({});
  const [profilesLoaded, setProfilesLoaded] = useState(false);
  const { locale } = useLocale();
  const tk = translations.tickets;

  function formatDate(dateStr: string): string {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  useEffect(() => {
    if (participants.length === 0) {
      setProfilesLoaded(true);
      return;
    }

    const addresses = participants.map((p) => p.address);
    const needFetch = addresses.filter(
      (a) => !profiles[a.toLowerCase()]
    );

    if (needFetch.length === 0) {
      setProfilesLoaded(true);
      return;
    }

    setProfilesLoaded(false);
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: needFetch }),
        });
        if (!res.ok) {
          if (!cancelled) setProfilesLoaded(true);
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        if (data.profiles) {
          setProfiles((prev) => ({ ...prev, ...data.profiles }));
        }
      } catch {
      } finally {
        if (!cancelled) setProfilesLoaded(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [participants]);

  const getProfile = (address: string): CirclesProfile | null => {
    return profiles[address.toLowerCase()] || null;
  };

  const showSkeletons = participants.length > 0 && !profilesLoaded;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">{tk.purchased[locale]}</p>
        <Badge variant="neutral">{participants.length} {participants.length !== 1 ? tk.tickets[locale] : tk.ticket[locale]}</Badge>
      </div>

      {participants.length === 0 ? (
        <div className="text-center py-6">
          <Ticket className="h-8 w-8 text-ink/20 mx-auto mb-2" />
          <p className="text-sm text-ink/50">{tk.noTickets[locale]}</p>
          <p className="text-xs text-ink/40 mt-1">{tk.noTicketsSub[locale]}</p>
        </div>
      ) : showSkeletons ? (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {participants.map((p) => (
            <SkeletonRow key={p.transactionHash} />
          ))}
        </div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {participants.map((p, i) => {
            const profile = getProfile(p.address);
            const displayName = profile?.name || p.address.slice(0, 6) + "..." + p.address.slice(-4);
            const avatarUrl = profile?.imageUrl || null;

            return (
              <div
                key={p.transactionHash}
                className="flex items-center gap-3 rounded-xl border border-ink/5 bg-sand/20 px-3 py-2.5 text-xs animate-in fade-in slide-in-from-bottom-1 duration-200"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-8 w-8 rounded-full object-cover shrink-0 border border-ink/10"
                  />
                ) : (
                  <div className="flex items-center justify-center h-8 w-8 rounded-full bg-indigo-100 text-indigo-600 font-bold text-xs shrink-0">
                    {participants.length - i}
                  </div>
                )}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="font-medium text-ink/90 truncate" title={p.address}>
                    {displayName}
                  </p>
                  <p className="text-ink/40 text-[10px]">{formatDate(p.paidAt)}</p>
                </div>
                <span className="text-ink/60 font-semibold whitespace-nowrap">{ticketPrice ?? 5} CRC</span>
              </div>
            );
          })}
        </div>
      )}

      <button
        onClick={onRefresh}
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-indigo-600 bg-indigo-600 text-white font-semibold py-2.5 px-4 text-sm hover:bg-indigo-700 transition-colors disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        {loading ? tk.searching[locale] : tk.refresh[locale]}
      </button>
    </div>
  );
}
