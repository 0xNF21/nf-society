"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Loader2, Eye, EyeOff, Clock,
  Flag, Gift, Sparkles, Trash2, RefreshCw, Send,
  ChevronDown, ExternalLink, AlertCircle, CheckCircle, XCircle,
  Palette, Check, Archive,
} from "lucide-react";
import Link from "next/link";
import type { FlagRow, FlagStatus } from "../types";
import { CATEGORY_COLORS, CATEGORY_LABELS, STATUS_CONFIG, STATUS_ORDER, PAYOUT_STATUS_COLORS } from "../constants";

/* ═══════════════════════════════════════════════════
   FLAGS TAB
   ═══════════════════════════════════════════════════ */
export function FlagsTab({ password }: { password: string }) {
  const [flags, setFlags] = useState<FlagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/flags", { headers: { "x-admin-password": password } });
        if (res.ok) { const data = await res.json(); setFlags(data.flags || []); }
      } catch {} finally { setLoading(false); }
    })();
  }, [password]);

  const cycleStatus = async (key: string, current: FlagStatus) => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(current) + 1) % STATUS_ORDER.length];
    setToggling(key);
    try {
      const res = await fetch("/api/admin/flags", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ key, status: next }),
      });
      if (res.ok) setFlags(prev => prev.map(f => f.key === key ? { ...f, status: next } : f));
    } catch { setError("Erreur"); } finally { setToggling(null); }
  };

  const grouped = flags.reduce<Record<string, FlagRow[]>>((acc, f) => {
    const cat = f.category || "general";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(f);
    return acc;
  }, {});

  if (loading) return <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-ink/30" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-4">
        {STATUS_ORDER.map(s => {
          const cfg = STATUS_CONFIG[s]; const Icon = cfg.icon;
          return <div key={s} className={`flex items-center gap-1.5 text-xs ${cfg.color}`}><Icon className="h-3.5 w-3.5" /><span className="font-medium">{cfg.label}</span></div>;
        })}
      </div>
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}
      {Object.entries(grouped).map(([cat, catFlags]) => (
        <div key={cat} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-ink/40 px-1">{CATEGORY_LABELS[cat] || cat}</h2>
          <div className="space-y-2">
            {catFlags.map(flag => {
              const cfg = STATUS_CONFIG[flag.status] || STATUS_CONFIG.enabled;
              const StatusIcon = cfg.icon;
              return (
                <div key={flag.key} className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all ${
                  flag.status === "enabled" ? (CATEGORY_COLORS[cat] || "border-ink/10 bg-white/80")
                    : flag.status === "coming_soon" ? "border-amber-200 bg-amber-50/30"
                      : "border-ink/5 bg-ink/5 opacity-50"
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink text-sm">{flag.label}</span>
                      <span className="text-[10px] font-mono text-ink/30 bg-ink/5 px-1.5 py-0.5 rounded">{flag.key}</span>
                    </div>
                  </div>
                  <button onClick={() => cycleStatus(flag.key, flag.status)} disabled={toggling === flag.key}
                    className={`shrink-0 ml-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 ${cfg.bg} ${cfg.color}`}>
                    {toggling === flag.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <StatusIcon className="h-3.5 w-3.5" />}
                    {cfg.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
