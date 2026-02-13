"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Ticket } from "lucide-react";

export type ParticipantEntry = {
  address: string;
  transactionHash: string;
  paidAt: string;
};

type CirclesProfile = {
  name: string;
  imageUrl: string | null;
};

function shortenAddress(addr: string): string {
  if (addr.length <= 14) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-FR", {
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

export function TicketHistory({
  participants,
  loading,
  onRefresh,
}: {
  participants: ParticipantEntry[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [profiles, setProfiles] = useState<Record<string, CirclesProfile>>({});

  useEffect(() => {
    if (participants.length === 0) return;

    const addresses = participants.map((p) => p.address);
    const needFetch = addresses.filter(
      (a) => !profiles[a.toLowerCase()]
    );

    if (needFetch.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/profiles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ addresses: needFetch }),
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        if (data.profiles) {
          setProfiles((prev) => ({ ...prev, ...data.profiles }));
        }
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [participants]);

  const getProfile = (address: string): CirclesProfile | null => {
    return profiles[address.toLowerCase()] || null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">Tickets achetés</p>
        <Badge variant="neutral">{participants.length} ticket{participants.length !== 1 ? "s" : ""}</Badge>
      </div>

      {participants.length === 0 ? (
        <div className="text-center py-6">
          <Ticket className="h-8 w-8 text-ink/20 mx-auto mb-2" />
          <p className="text-sm text-ink/50">Aucun ticket pour le moment.</p>
          <p className="text-xs text-ink/40 mt-1">Cliquez sur Rafraîchir pour vérifier.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {participants.map((p, i) => {
            const profile = getProfile(p.address);
            const displayName = profile?.name || shortenAddress(p.address);
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
                <span className="text-ink/60 font-semibold whitespace-nowrap">5 CRC</span>
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
        {loading ? "Recherche en cours..." : "Rafraîchir les tickets"}
      </button>
    </div>
  );
}
