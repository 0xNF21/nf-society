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
   LOTTERIES TAB
   ═══════════════════════════════════════════════════ */
export function LotteriesTab({ password }: { password: string }) {
  const [lotteries, setLotteries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusChanging, setStatusChanging] = useState<number | null>(null);
  const [drawLoading, setDrawLoading] = useState<number | null>(null);
  const [drawResult, setDrawResult] = useState<{ id: number; winner?: string; error?: string } | null>(null);

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", organizer: "", description: "", ticketPriceCrc: "5", recipientAddress: "", primaryColor: "#251B9F", accentColor: "#FF491B", logoUrl: "", theme: "light", commissionPercent: "5" });
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ slug?: string; error?: string } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lotteries");
      const data = await res.json();
      setLotteries(Array.isArray(data) ? data : data.lotteries || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const changeStatus = async (slug: string, id: number, newStatus: string) => {
    setStatusChanging(id);
    try {
      await fetch(`/api/lotteries/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, status: newStatus }),
      });
      await fetchAll();
    } catch {} finally { setStatusChanging(null); }
  };

  const performDraw = async (lotteryId: number) => {
    setDrawLoading(lotteryId);
    setDrawResult(null);
    try {
      const res = await fetch(`/api/draw?lotteryId=${lotteryId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, lotteryId }),
      });
      const data = await res.json();
      if (data.draw) {
        setDrawResult({ id: lotteryId, winner: data.draw.winnerAddress });
      } else {
        setDrawResult({ id: lotteryId, error: data.error || "Erreur" });
      }
    } catch (e: any) {
      setDrawResult({ id: lotteryId, error: e.message });
    } finally { setDrawLoading(null); }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateResult(null);
    try {
      const res = await fetch("/api/lotteries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          title: form.title.trim(),
          organizer: form.organizer.trim(),
          description: form.description.trim() || null,
          ticketPriceCrc: parseInt(form.ticketPriceCrc) || 5,
          recipientAddress: form.recipientAddress.trim().toLowerCase(),
          primaryColor: form.primaryColor,
          accentColor: form.accentColor,
          logoUrl: form.logoUrl.trim() || null,
          theme: form.theme,
          commissionPercent: parseInt(form.commissionPercent) || 5,
        }),
      });
      const data = await res.json();
      if (data.slug) {
        setCreateResult({ slug: data.slug });
        setForm({ title: "", organizer: "", description: "", ticketPriceCrc: "5", recipientAddress: "", primaryColor: "#251B9F", accentColor: "#FF491B", logoUrl: "", theme: "light", commissionPercent: "5" });
        fetchAll();
      } else {
        setCreateResult({ error: data.error || "Erreur" });
      }
    } catch { setCreateResult({ error: "Erreur de connexion" }); } finally { setCreating(false); }
  };

  const shortAddr = (a: string) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";
  const statusBadge = (s: string) => {
    if (s === "active") return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Actif</span>;
    if (s === "completed") return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium flex items-center gap-1"><CheckCircle className="h-3 w-3" />Termine</span>;
    if (s === "archived") return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium flex items-center gap-1"><Archive className="h-3 w-3" />Archive</span>;
    return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">{s}</span>;
  };

  if (loading) return <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-ink/30" /></div>;

  return (
    <div className="space-y-6">
      {/* Create button */}
      <button onClick={() => setShowCreate(!showCreate)}
        className="w-full flex items-center justify-between p-4 rounded-2xl border-2 border-dashed border-ink/10 hover:border-marine/30 hover:bg-marine/5 transition-all">
        <span className="flex items-center gap-2 text-sm font-semibold text-ink/60">
          <Sparkles className="h-4 w-4" /> Creer une loterie
        </span>
        <ChevronDown className={`h-4 w-4 text-ink/30 transition-transform ${showCreate ? "rotate-180" : ""}`} />
      </button>

      {showCreate && (
        <form onSubmit={handleCreate} className="space-y-4 p-5 rounded-2xl border-2 border-ink/10 bg-white/80">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Titre</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Loterie NF #1" className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Organisateur</label>
              <input type="text" value={form.organizer} onChange={e => setForm(f => ({ ...f, organizer: e.target.value }))}
                placeholder="NF Society" className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={2} placeholder="..." className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine resize-none" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Prix (CRC)</label>
              <input type="number" min="1" value={form.ticketPriceCrc} onChange={e => setForm(f => ({ ...f, ticketPriceCrc: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Commission %</label>
              <input type="number" min="0" max="50" value={form.commissionPercent} onChange={e => setForm(f => ({ ...f, commissionPercent: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-marine" />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Theme</label>
              <select value={form.theme} onChange={e => setForm(f => ({ ...f, theme: e.target.value }))}
                className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm bg-white focus:outline-none focus:border-marine">
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink/60 mb-1">Adresse de reception (Safe)</label>
            <input type="text" value={form.recipientAddress} onChange={e => setForm(f => ({ ...f, recipientAddress: e.target.value }))}
              placeholder="0x..." className="w-full px-3 py-2 border-2 border-ink/10 rounded-xl text-sm font-mono focus:outline-none focus:border-marine" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Couleur principale</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="h-9 w-9 rounded-lg border cursor-pointer" />
                <span className="text-xs font-mono text-ink/40">{form.primaryColor}</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink/60 mb-1">Couleur accent</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.accentColor} onChange={e => setForm(f => ({ ...f, accentColor: e.target.value }))} className="h-9 w-9 rounded-lg border cursor-pointer" />
                <span className="text-xs font-mono text-ink/40">{form.accentColor}</span>
              </div>
            </div>
          </div>
          {createResult?.slug && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 flex items-center gap-2">
              <Check className="h-4 w-4" /> Loterie creee : <Link href={`/loterie/${createResult.slug}`} className="underline font-mono">/loterie/{createResult.slug}</Link>
            </div>
          )}
          {createResult?.error && <p className="text-sm text-red-500">{createResult.error}</p>}
          <button type="submit" disabled={creating || !form.title || !form.organizer || !form.recipientAddress}
            className="w-full py-2.5 rounded-xl text-white font-semibold disabled:opacity-50 transition-colors" style={{ backgroundColor: form.primaryColor }}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Creer la loterie"}
          </button>
        </form>
      )}

      {/* Lotteries list */}
      {lotteries.length === 0 ? (
        <p className="text-center text-ink/40 py-8">Aucune loterie</p>
      ) : (
        <div className="space-y-3">
          {lotteries.map((lot: any) => (
            <div key={lot.id} className={`rounded-2xl border-2 p-4 transition-all ${
              lot.status === "active" ? "border-ink/10 bg-white/80" : "border-ink/5 bg-ink/5 opacity-70"
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: lot.primaryColor + "20" }}>
                    <Sparkles className="h-4 w-4" style={{ color: lot.primaryColor }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-ink truncate">{lot.title}</p>
                    <p className="text-xs text-ink/40">{lot.organizer} &middot; {lot.ticketPriceCrc} CRC &middot; <span className="font-mono">{shortAddr(lot.recipientAddress)}</span></p>
                  </div>
                </div>
                {statusBadge(lot.status)}
              </div>

              {drawResult && drawResult.id === lot.id && (
                <div className={`text-sm p-2 rounded-lg mb-2 ${drawResult.winner ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                  {drawResult.winner ? `Gagnant : ${shortAddr(drawResult.winner)}` : drawResult.error}
                </div>
              )}

              <div className="flex gap-2 pt-2 border-t border-ink/5 flex-wrap">
                {lot.status === "active" && (
                  <>
                    <button onClick={() => performDraw(lot.id)} disabled={drawLoading === lot.id}
                      className="text-xs font-semibold py-1.5 px-3 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50 flex items-center gap-1">
                      {drawLoading === lot.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                      Tirage
                    </button>
                    <button onClick={() => changeStatus(lot.slug, lot.id, "completed")} disabled={statusChanging === lot.id}
                      className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50">
                      Terminer
                    </button>
                    <button onClick={() => changeStatus(lot.slug, lot.id, "archived")} disabled={statusChanging === lot.id}
                      className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50">
                      Archiver
                    </button>
                  </>
                )}
                {lot.status === "completed" && (
                  <>
                    <button onClick={() => changeStatus(lot.slug, lot.id, "active")} disabled={statusChanging === lot.id}
                      className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50">
                      Reactiver
                    </button>
                    <button onClick={() => changeStatus(lot.slug, lot.id, "archived")} disabled={statusChanging === lot.id}
                      className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50">
                      Archiver
                    </button>
                  </>
                )}
                {lot.status === "archived" && (
                  <button onClick={() => changeStatus(lot.slug, lot.id, "active")} disabled={statusChanging === lot.id}
                    className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors disabled:opacity-50">
                    Reactiver
                  </button>
                )}
                <Link href={`/loterie/${lot.slug}`} className="text-xs font-semibold py-1.5 px-3 rounded-lg border border-ink/10 text-ink/50 hover:bg-ink/5 transition-colors ml-auto">
                  Voir
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
