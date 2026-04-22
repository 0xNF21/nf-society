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

/* ─── Shop Items Tab ─── */

interface ShopItemRow {
  id: number; slug: string; name: string; description: string; icon: string;
  category: string; xpCost: number; levelRequired: number; stock: number | null; active: boolean;
}

export function ShopTab({ password }: { password: string }) {
  const [items, setItems] = useState<ShopItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editItems, setEditItems] = useState<Record<string, Partial<ShopItemRow>>>({});

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/shop", { headers: { "x-admin-password": password } });
      const data = await res.json();
      setItems(data.items || []);
    } catch {}
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function updateField(slug: string, field: string, value: unknown) {
    setEditItems(prev => ({ ...prev, [slug]: { ...prev[slug], [field]: value } }));
  }

  async function saveItem(slug: string) {
    setSaving(slug);
    try {
      await fetch("/api/admin/shop", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ slug, ...editItems[slug] }),
      });
      setEditItems(prev => { const n = { ...prev }; delete n[slug]; return n; });
      await fetchItems();
    } catch {}
    setSaving(null);
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink/30" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="text-xs font-bold text-ink/40 uppercase tracking-widest">Articles Shop ({items.length})</h3>
      {items.map(item => {
        const edits = editItems[item.slug] || {};
        const hasChanges = Object.keys(edits).length > 0;
        return (
          <div key={item.slug} className="p-4 rounded-xl bg-white/60 dark:bg-white/5 border border-ink/5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{item.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-bold text-ink dark:text-white">{item.name}</p>
                <p className="text-[10px] text-ink/30 font-mono">{item.slug} · {item.category}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {item.active ? "Actif" : "Inactif"}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-ink/40 font-bold">Prix XP</label>
                <input type="number" min={0} value={edits.xpCost ?? item.xpCost}
                  onChange={e => updateField(item.slug, "xpCost", parseInt(e.target.value) || 0)}
                  className="w-full px-2 py-1.5 rounded-lg border border-ink/10 text-sm font-bold" />
              </div>
              <div>
                <label className="text-[10px] text-ink/40 font-bold">Niveau req.</label>
                <input type="number" min={1} max={10} value={edits.levelRequired ?? item.levelRequired}
                  onChange={e => updateField(item.slug, "levelRequired", parseInt(e.target.value) || 1)}
                  className="w-full px-2 py-1.5 rounded-lg border border-ink/10 text-sm font-bold" />
              </div>
              <div>
                <label className="text-[10px] text-ink/40 font-bold">Stock</label>
                <input type="number" min={0} value={edits.stock ?? item.stock ?? 999}
                  onChange={e => updateField(item.slug, "stock", parseInt(e.target.value) || null)}
                  className="w-full px-2 py-1.5 rounded-lg border border-ink/10 text-sm font-bold" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => updateField(item.slug, "active", !(edits.active ?? item.active))}
                className={`text-xs px-3 py-1 rounded-lg border transition-all ${
                  (edits.active ?? item.active) ? "border-green-300 bg-green-50 text-green-700" : "border-red-300 bg-red-50 text-red-700"
                }`}>
                {(edits.active ?? item.active) ? "Actif" : "Inactif"}
              </button>
              {hasChanges && (
                <button onClick={() => saveItem(item.slug)} disabled={saving === item.slug}
                  className="ml-auto px-3 py-1 rounded-lg bg-marine text-white text-xs font-bold hover:opacity-90">
                  {saving === item.slug ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sauvegarder"}
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
