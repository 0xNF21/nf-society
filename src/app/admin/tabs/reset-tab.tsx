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

/* ─── Reset Tab ─── */

interface ResetTarget { key: string; label: string; tables: string[] }

export function ResetTab({ password }: { password: string }) {
  const [targets, setTargets] = useState<ResetTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string[]>>({});
  const [confirmInput, setConfirmInput] = useState<Record<string, string>>({});

  const fetchTargets = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reset", { headers: { "x-admin-password": password } });
      const data = await res.json();
      setTargets(data.targets || []);
    } catch {}
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  async function resetTarget(key: string) {
    if (confirmInput[key] !== "confirmer") return;
    setResetting(key);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ target: key, confirm: "confirmer" }),
      });
      const data = await res.json();
      if (data.results) setResults(prev => ({ ...prev, [key]: data.results }));
      setConfirmInput(prev => ({ ...prev, [key]: "" }));
    } catch {}
    setResetting(null);
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink/30" /></div>;

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800">
        <p className="text-sm font-bold text-red-700 dark:text-red-400">Zone dangereuse</p>
        <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">
          Ces actions suppriment les donnees. Un backup est sauvegarde automatiquement dans la DB avant chaque suppression.
        </p>
      </div>

      {targets.map(target => (
        <div key={target.key} className="p-4 rounded-xl bg-white/60 dark:bg-white/5 border border-ink/5 space-y-3">
          <div>
            <p className="text-sm font-bold text-ink dark:text-white">{target.label}</p>
            <p className="text-[10px] text-ink/30 font-mono">Tables: {target.tables.join(", ")}</p>
          </div>

          <div className="flex gap-2">
            <input
              placeholder="Tapez confirmer"
              value={confirmInput[target.key] || ""}
              onChange={e => setConfirmInput(prev => ({ ...prev, [target.key]: e.target.value }))}
              className="flex-1 px-3 py-2 rounded-lg border border-red-200 text-sm text-red-600 placeholder:text-red-300"
            />
            <button
              onClick={() => resetTarget(target.key)}
              disabled={resetting === target.key || confirmInput[target.key] !== "confirmer"}
              className="px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {resetting === target.key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Supprimer"}
            </button>
          </div>

          {results[target.key] && (
            <div className="p-2 rounded-lg bg-ink/[0.03] text-[10px] font-mono text-ink/50 space-y-0.5">
              {results[target.key].map((r, i) => <p key={i}>{r}</p>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
