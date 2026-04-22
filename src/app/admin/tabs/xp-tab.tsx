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

/* ─── XP Config Tab ─── */

interface XpConfigRow { key: string; value: number; category: string; label: string; updatedAt: string }

export function XpTab({ password }: { password: string }) {
  const [configs, setConfigs] = useState<XpConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
  const [editLabels, setEditLabels] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState(10);
  const [newLabel, setNewLabel] = useState("");
  const [newCategory, setNewCategory] = useState("reward");
  const [adding, setAdding] = useState(false);

  const fetchConfigs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/xp", { headers: { "x-admin-password": password } });
      const data = await res.json();
      setConfigs(data.configs || []);
      const values: Record<string, number> = {};
      const labels: Record<string, string> = {};
      for (const c of data.configs || []) { values[c.key] = c.value; labels[c.key] = c.label; }
      setEditValues(values);
      setEditLabels(labels);
    } catch {}
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  async function saveValue(key: string) {
    setSaving(key);
    try {
      const original = configs.find(c => c.key === key);
      const body: Record<string, unknown> = { key, value: editValues[key] };
      if (editLabels[key] && editLabels[key] !== original?.label) body.label = editLabels[key];
      await fetch("/api/admin/xp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify(body),
      });
      await fetchConfigs();
    } catch {}
    setSaving(null);
  }

  async function addConfig() {
    if (!newKey || !newLabel) return;
    setAdding(true);
    try {
      await fetch("/api/admin/xp", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ key: newKey, value: newValue, category: newCategory, label: newLabel }),
      });
      setNewKey(""); setNewValue(10); setNewLabel("");
      await fetchConfigs();
    } catch {}
    setAdding(false);
  }

  async function deleteConfig(key: string) {
    if (!confirm(`Supprimer ${key} ?`)) return;
    try {
      await fetch("/api/admin/xp", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ key }),
      });
      await fetchConfigs();
    } catch {}
  }

  const rewards = configs.filter(c => c.category === "reward");
  const levels = configs.filter(c => c.category === "level").sort((a, b) => {
    const na = parseInt(a.key.replace("level_", "")); const nb = parseInt(b.key.replace("level_", ""));
    return na - nb;
  });
  const bonuses = configs.filter(c => c.category === "bonus");

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink/30" /></div>;

  function ConfigRow({ c }: { c: XpConfigRow }) {
    const valueChanged = editValues[c.key] !== c.value;
    const labelChanged = editLabels[c.key] !== c.label;
    const changed = valueChanged || labelChanged;
    const isLevel = c.category === "level";
    return (
      <div key={c.key} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/60 dark:bg-white/5 border border-ink/5">
        <div className="flex-1 min-w-0">
          {isLevel ? (
            <input value={editLabels[c.key] ?? c.label}
              onChange={e => setEditLabels(prev => ({ ...prev, [c.key]: e.target.value }))}
              className="text-sm font-semibold text-ink dark:text-white bg-transparent border-b border-transparent hover:border-ink/20 focus:border-marine/40 focus:outline-none w-full"
            />
          ) : (
            <p className="text-sm font-semibold text-ink dark:text-white truncate">{c.label}</p>
          )}
          <p className="text-[10px] text-ink/30 font-mono">{c.key}</p>
        </div>
        <input type="number" min={0} value={editValues[c.key] ?? c.value}
          onChange={e => setEditValues(prev => ({ ...prev, [c.key]: parseInt(e.target.value) || 0 }))}
          className="w-20 px-2 py-1.5 rounded-lg border border-ink/10 bg-white dark:bg-white/10 text-sm font-bold text-center"
        />
        {changed && (
          <button onClick={() => saveValue(c.key)} disabled={saving === c.key}
            className="px-2 py-1 rounded-lg bg-marine text-white text-xs font-bold hover:opacity-90">
            {saving === c.key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          </button>
        )}
        {c.category === "reward" && (
          <button onClick={() => deleteConfig(c.key)} className="text-red-400 hover:text-red-600">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Rewards */}
      <div>
        <h3 className="text-xs font-bold text-ink/40 uppercase tracking-widest mb-3">Rewards XP par action</h3>
        <div className="space-y-1.5">
          {rewards.map(c => <ConfigRow key={c.key} c={c} />)}
        </div>
      </div>

      {/* Add new reward */}
      <div className="p-4 rounded-xl border-2 border-dashed border-ink/10 space-y-3">
        <p className="text-xs font-bold text-ink/40 uppercase tracking-widest">Ajouter une action XP</p>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Cle (ex: poker_win)" value={newKey} onChange={e => setNewKey(e.target.value)}
            className="px-3 py-2 rounded-lg border border-ink/10 text-sm" />
          <input placeholder="Label (ex: Poker — Victoire)" value={newLabel} onChange={e => setNewLabel(e.target.value)}
            className="px-3 py-2 rounded-lg border border-ink/10 text-sm" />
          <input type="number" min={0} value={newValue} onChange={e => setNewValue(parseInt(e.target.value) || 0)}
            className="px-3 py-2 rounded-lg border border-ink/10 text-sm font-bold" />
          <select value={newCategory} onChange={e => setNewCategory(e.target.value)}
            className="px-3 py-2 rounded-lg border border-ink/10 text-sm">
            <option value="reward">Reward</option>
            <option value="bonus">Bonus</option>
          </select>
        </div>
        <button onClick={addConfig} disabled={adding || !newKey || !newLabel}
          className="w-full py-2 rounded-lg bg-marine text-white text-sm font-bold hover:opacity-90 disabled:opacity-50">
          {adding ? "Ajout..." : "Ajouter"}
        </button>
      </div>

      {/* Levels */}
      <div>
        <h3 className="text-xs font-bold text-ink/40 uppercase tracking-widest mb-3">Niveaux (XP requis)</h3>
        <div className="space-y-1.5">
          {levels.map(c => <ConfigRow key={c.key} c={c} />)}
        </div>
      </div>

      {/* Bonuses */}
      {bonuses.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-ink/40 uppercase tracking-widest mb-3">Bonus</h3>
          <div className="space-y-1.5">
            {bonuses.map(c => <ConfigRow key={c.key} c={c} />)}
          </div>
        </div>
      )}
    </div>
  );
}
