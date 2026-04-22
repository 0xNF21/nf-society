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
   LOOTBOXES TAB
   ═══════════════════════════════════════════════════ */
export function LootboxesTab({ password }: { password: string }) {
  const [lootboxes, setLootboxes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", slug: "", description: "", pricePerOpenCrc: "10", recipientAddress: "0x960A0784640fD6581D221A56df1c60b65b5ebB6f", accentColor: "#F59E0B" });
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ slug?: string; error?: string } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lootboxes", { cache: "no-store" });
      if (res.ok) setLootboxes(await res.json());
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async (id: number) => {
    setDeleting(id);
    try {
      await fetch(`/api/lootboxes/${id}`, { method: "DELETE", headers: { "x-admin-password": password } });
      setConfirmDelete(null);
      await fetchAll();
    } catch {} finally { setDeleting(null); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateResult(null);
    try {
      const res = await fetch("/api/lootboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({
          slug: form.slug.trim(),
          title: form.title.trim(),
          description: form.description.trim() || null,
          pricePerOpenCrc: parseInt(form.pricePerOpenCrc) || 10,
          recipientAddress: form.recipientAddress.trim().toLowerCase(),
          accentColor: form.accentColor,
        }),
      });
      const data = await res.json();
      if (data.slug) {
        setCreateResult({ slug: data.slug });
        setForm({ title: "", slug: "", description: "", pricePerOpenCrc: "10", recipientAddress: "0x960A0784640fD6581D221A56df1c60b65b5ebB6f", accentColor: "#F59E0B" });
        fetchAll();
      } else {
        setCreateResult({ error: data.error || "Erreur" });
      }
    } catch { setCreateResult({ error: "Erreur" }); } finally { setCreating(false); }
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-ink/30" /></div>;

  return (
    <div className="space-y-6">
      <button onClick={() => setShowCreate(!showCreate)}
        className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-dashed border-ink/10 hover:border-amber-300/50 hover:bg-amber-50/30 transition-all">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink/60"><Gift className="h-4 w-4" /> Creer une lootbox</span>
        <ChevronDown className={`h-4 w-4 text-ink/30 transition-transform ${showCreate ? "rotate-180" : ""}`} />
      </button>

      {showCreate && (
        <form onSubmit={handleCreate} className="space-y-4 p-5 rounded-2xl border-2 border-ink/10 bg-white/80">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Titre</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Lootbox Bronze" className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-amber-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Slug (URL)</label>
              <input type="text" value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))}
                placeholder="lootbox-bronze" className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm font-mono focus:outline-none focus:border-amber-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1">Description</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Ouvre pour gagner..." className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-amber-400" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Prix (CRC)</label>
              <select value={form.pricePerOpenCrc} onChange={e => setForm(f => ({ ...f, pricePerOpenCrc: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm bg-white focus:outline-none focus:border-amber-400">
                {[10, 20, 30, 40, 50, 100].map(v => <option key={v} value={v}>{v} CRC</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Couleur</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.accentColor} onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))} className="h-9 w-9 rounded-lg border cursor-pointer" />
                <span className="text-xs font-mono text-ink/40">{form.accentColor}</span>
              </div>
            </div>
          </div>
          {createResult?.slug && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 flex items-center gap-2">
              <Check className="h-4 w-4" /> Lootbox creee : <Link href={`/lootbox/${createResult.slug}`} className="underline font-mono">/lootbox/{createResult.slug}</Link>
            </div>
          )}
          {createResult?.error && <p className="text-sm text-red-500">{createResult.error}</p>}
          <button type="submit" disabled={creating || !form.title || !form.slug}
            className="w-full py-2.5 rounded-xl text-white font-semibold disabled:opacity-50 transition-colors" style={{ backgroundColor: form.accentColor }}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Creer la lootbox"}
          </button>
        </form>
      )}

      {lootboxes.length === 0 ? (
        <p className="text-center text-ink/40 py-8">Aucune lootbox</p>
      ) : (
        <div className="space-y-2">
          {lootboxes.map((lb: any) => (
            <div key={lb.id} className="flex items-center justify-between bg-white/80 border-2 border-ink/5 rounded-2xl p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 text-lg" style={{ backgroundColor: (lb.accentColor || "#F59E0B") + "15" }}>
                  🎁
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-ink truncate">{lb.title}</p>
                  <p className="text-xs text-ink/40 font-mono">/lootbox/{lb.slug} &middot; {lb.pricePerOpenCrc} CRC</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full ${lb.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {lb.status}
                </span>
                {confirmDelete === lb.id ? (
                  <div className="flex items-center gap-1">
                    <button onClick={() => handleDelete(lb.id)} disabled={deleting === lb.id}
                      className="px-2 py-1 rounded-lg text-xs font-semibold bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">
                      {deleting === lb.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Oui"}
                    </button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="px-2 py-1 rounded-lg text-xs font-semibold bg-ink/5 text-ink/50 hover:bg-ink/10">Non</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDelete(lb.id)} className="p-1.5 rounded-lg text-ink/30 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
