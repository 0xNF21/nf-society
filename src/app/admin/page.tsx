"use client";

import { useState, useCallback, useEffect } from "react";
import {
  ArrowLeft, Shield, Loader2, Lock, LogIn, Eye, EyeOff, Clock,
  Flag, Ticket, Gift, Wallet, Sparkles, Trash2, RefreshCw, Send,
  ChevronDown, ExternalLink, AlertCircle, CheckCircle, XCircle,
  Palette, Check, Archive
} from "lucide-react";
import Link from "next/link";

/* ─── Types ─── */
type FlagStatus = "enabled" | "coming_soon" | "hidden";
interface FlagRow { key: string; status: FlagStatus; label: string; category: string; updatedAt: string }

type Tab = "flags" | "lotteries" | "lootboxes" | "payouts" | "xp" | "shop" | "daily" | "badges" | "reset";

/* ─── Constants ─── */
const TABS: { key: Tab; label: string; icon: typeof Flag }[] = [
  { key: "flags",     label: "Flags",     icon: Flag },
  { key: "lotteries", label: "Loteries",  icon: Ticket },
  { key: "lootboxes", label: "Lootboxes", icon: Gift },
  { key: "payouts",   label: "Payouts",   icon: Wallet },
  { key: "xp",        label: "XP",        icon: Sparkles },
  { key: "shop",      label: "Shop",      icon: Gift },
  { key: "daily",     label: "Daily",     icon: Clock },
  { key: "badges",    label: "Badges",    icon: Shield },
  { key: "reset",     label: "Reset",     icon: Trash2 },
];

const CATEGORY_COLORS: Record<string, string> = {
  chance: "border-amber-200 bg-amber-50/50",
  multiplayer: "border-violet-200 bg-violet-50/50",
  general: "border-sky-200 bg-sky-50/50",
};
const CATEGORY_LABELS: Record<string, string> = {
  chance: "Jeux de chance",
  multiplayer: "Jeux multijoueur",
  general: "General",
};
const STATUS_CONFIG: Record<FlagStatus, { label: string; icon: typeof Eye; color: string; bg: string }> = {
  enabled:     { label: "Actif",       icon: Eye,    color: "text-green-600", bg: "bg-green-100 border-green-300" },
  coming_soon: { label: "Coming Soon", icon: Clock,  color: "text-amber-600", bg: "bg-amber-100 border-amber-300" },
  hidden:      { label: "Cache",       icon: EyeOff, color: "text-ink/40",    bg: "bg-ink/5 border-ink/10" },
};
const STATUS_ORDER: FlagStatus[] = ["enabled", "coming_soon", "hidden"];

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  wrapping: "bg-blue-100 text-blue-800",
  sending: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

/* ─── Main ─── */
export default function AdminPage() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("flags");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        setAuthenticated(true);
      } else {
        setError("Mot de passe incorrect");
      }
    } catch {
      setError("Erreur de connexion");
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto h-16 w-16 rounded-2xl bg-marine/10 flex items-center justify-center">
              <Shield className="h-8 w-8 text-marine" />
            </div>
            <h1 className="font-display text-2xl font-bold text-ink dark:text-white">Admin</h1>
            <p className="text-sm text-ink/50 dark:text-white/50">Panneau d&apos;administration NF Society</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink/30" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe admin"
                className="w-full pl-10 pr-4 py-3 rounded-xl border-2 border-ink/10 dark:border-white/10 bg-white dark:bg-white/5 text-ink dark:text-white focus:border-marine focus:outline-none transition-colors"
                autoFocus />
            </div>
            {error && <p className="text-sm text-red-500 text-center">{error}</p>}
            <button type="submit" disabled={loading || !password}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-marine text-white font-semibold hover:bg-marine/90 disabled:opacity-50 transition-colors">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
              Connexion
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex flex-col">
      <div className="flex-1 flex flex-col items-center px-4 py-8">
        <div className="w-full max-w-3xl flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-sm text-ink/50 dark:text-white/50 hover:text-ink dark:hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" /> Retour
            </Link>
          </div>

          <header className="text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-xl bg-marine/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-marine" />
            </div>
            <h1 className="font-display text-3xl font-bold text-ink dark:text-white">Administration</h1>
          </header>

          {/* Tabs */}
          <div className="flex gap-1 bg-ink/5 dark:bg-white/5 rounded-2xl p-1">
            {TABS.map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === key
                    ? "bg-white dark:bg-white/10 text-ink dark:text-white shadow-sm"
                    : "text-ink/40 dark:text-white/40 hover:text-ink/60"
                }`}>
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>

          {activeTab === "flags" && <FlagsTab password={password} />}
          {activeTab === "lotteries" && <LotteriesTab password={password} />}
          {activeTab === "lootboxes" && <LootboxesTab password={password} />}
          {activeTab === "payouts" && <PayoutsTab password={password} />}
          {activeTab === "xp" && <XpTab password={password} />}
          {activeTab === "shop" && <ShopTab password={password} />}
          {activeTab === "daily" && <DailyTab password={password} />}
          {activeTab === "badges" && <BadgesTab password={password} />}
          {activeTab === "reset" && <ResetTab password={password} />}
        </div>
      </div>
    </main>
  );
}

/* ═══════════════════════════════════════════════════
   FLAGS TAB
   ═══════════════════════════════════════════════════ */
function FlagsTab({ password }: { password: string }) {
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

/* ═══════════════════════════════════════════════════
   LOTTERIES TAB
   ═══════════════════════════════════════════════════ */
function LotteriesTab({ password }: { password: string }) {
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

/* ═══════════════════════════════════════════════════
   LOOTBOXES TAB
   ═══════════════════════════════════════════════════ */
function LootboxesTab({ password }: { password: string }) {
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

/* ═══════════════════════════════════════════════════
   PAYOUTS TAB
   ═══════════════════════════════════════════════════ */
function PayoutsTab({ password }: { password: string }) {
  const [payoutStatus, setPayoutStatus] = useState<any>(null);
  const [payoutList, setPayoutList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ gameType: "reward", recipientAddress: "", amountCrc: "", reason: "" });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualResult, setManualResult] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, lRes] = await Promise.all([
        fetch("/api/payout/status", { cache: "no-store" }),
        fetch("/api/payout?limit=20", { cache: "no-store", headers: { Authorization: `Bearer ${password}` } }),
      ]);
      if (sRes.ok) setPayoutStatus(await sRes.json());
      if (lRes.ok) { const d = await lRes.json(); setPayoutList(d.payouts || []); }
    } catch {} finally { setLoading(false); }
  }, [password]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRetry = async (id: number) => {
    setRetrying(id);
    try {
      await fetch("/api/payout/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payoutId: id, password }) });
      await fetchData();
    } catch {} finally { setRetrying(null); }
  };

  const handleManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualSubmitting(true);
    setManualResult(null);
    try {
      const res = await fetch("/api/payout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, gameType: manualForm.gameType, gameId: `manual-${Date.now()}`, recipientAddress: manualForm.recipientAddress.trim().toLowerCase(), amountCrc: parseInt(manualForm.amountCrc) || 0, reason: manualForm.reason || undefined }),
      });
      const data = await res.json();
      setManualResult(data);
      if (data.success) { setManualForm({ gameType: "reward", recipientAddress: "", amountCrc: "", reason: "" }); fetchData(); }
    } catch (e: any) { setManualResult({ success: false, error: e.message }); }
    setManualSubmitting(false);
  };

  const shortAddr = (a: string) => a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "";

  if (loading) return <div className="text-center py-8"><Loader2 className="h-6 w-6 animate-spin mx-auto text-ink/30" /></div>;

  return (
    <div className="space-y-6">
      {/* Status */}
      {payoutStatus && !payoutStatus.configured && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-amber-800">Systeme de payout non configure</p>
              <p className="text-sm text-amber-700">Variables manquantes : {payoutStatus.missingVars?.join(", ")}</p>
            </div>
          </div>
        </div>
      )}

      {payoutStatus?.configured && (
        <div className="rounded-2xl border-2 border-ink/10 bg-white/80 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-ink/40 text-xs">Status</p>
              <p className="font-semibold text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> Configure</p>
            </div>
            <div>
              <p className="text-ink/40 text-xs">Bot Gas (xDAI)</p>
              <p className="font-semibold">{Number(payoutStatus.botXdaiBalance || 0).toFixed(4)}</p>
            </div>
            <div>
              <p className="text-ink/40 text-xs">Bot Wallet</p>
              <p className="font-mono text-xs">{shortAddr(payoutStatus.botAddress || "")}</p>
            </div>
            <div>
              <p className="text-ink/40 text-xs">Safe Balance (ERC-20)</p>
              <p className="font-semibold">{Number(payoutStatus.safeBalance?.erc20 || 0).toFixed(2)} CRC</p>
            </div>
            <div>
              <p className="text-ink/40 text-xs">Safe Address</p>
              <p className="font-mono text-xs">{shortAddr(payoutStatus.safeAddress || "")}</p>
            </div>
            <div>
              <p className="text-ink/40 text-xs">Safe Balance (ERC-1155)</p>
              <p className="font-semibold">{Number(payoutStatus.safeBalance?.erc1155 || 0).toFixed(2)} CRC</p>
            </div>
          </div>
        </div>
      )}

      {/* Manual payout */}
      {payoutStatus?.configured && (
        <div className="rounded-2xl border-2 border-ink/10 bg-white/80 p-4">
          <button onClick={() => setManualOpen(!manualOpen)} className="w-full flex items-center justify-between text-sm font-semibold text-ink">
            <span className="flex items-center gap-2"><Send className="h-4 w-4" /> Payout manuel</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${manualOpen ? "rotate-180" : ""}`} />
          </button>
          {manualOpen && (
            <form onSubmit={handleManual} className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-ink/40">Type</label>
                  <select value={manualForm.gameType} onChange={e => setManualForm(f => ({ ...f, gameType: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm">
                    <option value="lottery">Lottery</option><option value="lootbox">Lootbox</option><option value="game">Game</option><option value="reward">Reward</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-ink/40">Montant (CRC)</label>
                  <input type="number" min="1" value={manualForm.amountCrc} onChange={e => setManualForm(f => ({ ...f, amountCrc: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" required />
                </div>
              </div>
              <div>
                <label className="text-xs text-ink/40">Destinataire</label>
                <input type="text" placeholder="0x..." value={manualForm.recipientAddress} onChange={e => setManualForm(f => ({ ...f, recipientAddress: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm font-mono" required />
              </div>
              <div>
                <label className="text-xs text-ink/40">Raison</label>
                <input type="text" value={manualForm.reason} onChange={e => setManualForm(f => ({ ...f, reason: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              {manualResult && (
                <div className={`text-sm p-2 rounded-lg ${manualResult.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                  {manualResult.success ? `Succes — Tx: ${manualResult.transferTxHash?.slice(0, 12)}...` : manualResult.error}
                </div>
              )}
              <button type="submit" disabled={manualSubmitting}
                className="w-full py-2 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-ink/90 disabled:opacity-50">
                {manualSubmitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : "Envoyer le payout"}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Payout list */}
      <div className="rounded-2xl border-2 border-ink/10 bg-white/80 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">Historique des payouts</h3>
          <button onClick={fetchData} className="text-ink/40 hover:text-ink/60"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
        </div>
        {payoutList.length === 0 ? (
          <p className="text-sm text-ink/40 text-center py-4">Aucun payout</p>
        ) : (
          <div className="space-y-2">
            {payoutList.map((po: any) => (
              <div key={po.id} className="bg-ink/5 rounded-lg p-3 text-sm space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[po.status] || "bg-gray-100 text-gray-600"}`}>
                      {po.status}
                    </span>
                    <span className="text-xs text-ink/40">{po.gameType}</span>
                  </div>
                  <span className="font-semibold">{po.amountCrc} CRC</span>
                </div>
                <div className="flex items-center justify-between text-xs text-ink/40">
                  <span className="font-mono">{shortAddr(po.recipientAddress)}</span>
                  <span>{new Date(po.createdAt).toLocaleDateString()}</span>
                </div>
                {po.reason && <p className="text-xs text-ink/50">{po.reason}</p>}
                <div className="flex items-center gap-2 text-xs">
                  {po.wrapTxHash && <a href={`https://gnosisscan.io/tx/${po.wrapTxHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5">Wrap <ExternalLink className="h-3 w-3" /></a>}
                  {po.transferTxHash && <a href={`https://gnosisscan.io/tx/${po.transferTxHash}`} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline flex items-center gap-0.5">Transfer <ExternalLink className="h-3 w-3" /></a>}
                  {po.status === "failed" && po.attempts < 3 && (
                    <button onClick={() => handleRetry(po.id)} disabled={retrying === po.id} className="text-amber-600 hover:underline flex items-center gap-0.5">
                      {retrying === po.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Retry
                    </button>
                  )}
                </div>
                {po.errorMessage && <p className="text-xs text-red-500">{po.errorMessage}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── XP Config Tab ─── */

interface XpConfigRow { key: string; value: number; category: string; label: string; updatedAt: string }

function XpTab({ password }: { password: string }) {
  const [configs, setConfigs] = useState<XpConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, number>>({});
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
      for (const c of data.configs || []) values[c.key] = c.value;
      setEditValues(values);
    } catch {}
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  async function saveValue(key: string) {
    setSaving(key);
    try {
      await fetch("/api/admin/xp", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ key, value: editValues[key] }),
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
    const changed = editValues[c.key] !== c.value;
    return (
      <div key={c.key} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/60 dark:bg-white/5 border border-ink/5">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink dark:text-white truncate">{c.label}</p>
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

/* ─── Shop Items Tab ─── */

interface ShopItemRow {
  id: number; slug: string; name: string; description: string; icon: string;
  category: string; xpCost: number; levelRequired: number; stock: number | null; active: boolean;
}

function ShopTab({ password }: { password: string }) {
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

/* ─── Daily Rewards Tab ─── */

interface DailyRewardEntry {
  prob: number;
  type: string;
  label: string;
  crcValue: number;
  xpValue: number;
  symbol?: string;
  color?: string;
}

function DailyTab({ password }: { password: string }) {
  const [scratch, setScratch] = useState<DailyRewardEntry[]>([]);
  const [spin, setSpin] = useState<DailyRewardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editScratch, setEditScratch] = useState<DailyRewardEntry[]>([]);
  const [editSpin, setEditSpin] = useState<DailyRewardEntry[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/daily", { headers: { "x-admin-password": password } });
      const data = await res.json();
      setScratch(data.scratch || []);
      setSpin(data.spin || []);
      setEditScratch(data.scratch || []);
      setEditSpin(data.spin || []);
    } catch {}
    setLoading(false);
  }, [password]);

  const [testAddress, setTestAddress] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => { fetchData(); }, [fetchData]);

  function updateEntry(table: "scratch" | "spin", index: number, field: string, value: unknown) {
    const setter = table === "scratch" ? setEditScratch : setEditSpin;
    setter(prev => {
      const updated = prev.map((e, i) => i === index ? { ...e, [field]: value } : e);

      // Auto-balance: when changing a prob, adjust "nothing" (first entry) to keep total = 100%
      if (field === "prob") {
        const nothingIdx = updated.findIndex(e => e.type === "nothing");
        if (nothingIdx >= 0 && nothingIdx !== index) {
          const othersTotal = updated.reduce((s, e, i) => i === nothingIdx ? s : s + e.prob, 0);
          const newNothingProb = Math.max(0, 1 - othersTotal);
          updated[nothingIdx] = { ...updated[nothingIdx], prob: Math.round(newNothingProb * 1000) / 1000 };
        }
      }

      return updated;
    });
  }

  async function saveTable(key: "scratch" | "spin") {
    setSaving(key);
    const rewards = key === "scratch" ? editScratch : editSpin;
    try {
      const res = await fetch("/api/admin/daily", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ key, rewards }),
      });
      const data = await res.json();
      if (!res.ok) alert(data.error);
      else await fetchData();
    } catch {}
    setSaving(null);
  }

  function hasChanges(key: "scratch" | "spin") {
    const original = key === "scratch" ? scratch : spin;
    const edited = key === "scratch" ? editScratch : editSpin;
    return JSON.stringify(original) !== JSON.stringify(edited);
  }

  function totalProb(entries: DailyRewardEntry[]) {
    return entries.reduce((s, e) => s + e.prob, 0);
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink/30" /></div>;

  function RewardTable({ title, tableKey, entries }: { title: string; tableKey: "scratch" | "spin"; entries: DailyRewardEntry[] }) {
    const total = totalProb(entries);
    const isValid = Math.abs(total - 1.0) <= 0.01;

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-ink/40 uppercase tracking-widest">{title}</h3>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isValid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              Total: {(total * 100).toFixed(1)}%
            </span>
            {hasChanges(tableKey) && (
              <button onClick={() => saveTable(tableKey)} disabled={saving === tableKey || !isValid || combinedRtp < 0.97 || combinedRtp > 1.0}
                className="px-3 py-1 rounded-lg bg-marine text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
                title={combinedRtp < 0.97 || combinedRtp > 1.0 ? "RTP doit être entre 97% et 100%" : ""}>
                {saving === tableKey ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sauvegarder"}
              </button>
            )}
          </div>
        </div>

        {entries.map((entry, i) => (
          <div key={i} className="p-3 rounded-xl bg-white/60 dark:bg-white/5 border border-ink/5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">{entry.symbol || "🎯"}</span>
              <input value={entry.label} onChange={e => updateEntry(tableKey, i, "label", e.target.value)}
                className="flex-1 px-2 py-1 rounded-lg border border-ink/10 text-sm font-semibold" />
            </div>
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-[10px] text-ink/40 font-bold">Prob %</label>
                <input type="text" inputMode="decimal"
                  defaultValue={entry.prob * 100}
                  key={`prob-${tableKey}-${i}-${scratch.length}`}
                  onBlur={e => updateEntry(tableKey, i, "prob", (parseFloat(e.target.value) || 0) / 100)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 text-sm font-bold" />
              </div>
              <div>
                <label className="text-[10px] text-ink/40 font-bold">CRC</label>
                <input type="number" step="0.1" min={0}
                  defaultValue={entry.crcValue}
                  onBlur={e => updateEntry(tableKey, i, "crcValue", parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 text-sm font-bold" />
              </div>
              <div>
                <label className="text-[10px] text-ink/40 font-bold">XP</label>
                <input type="number" step="1" min={0}
                  defaultValue={entry.xpValue}
                  onBlur={e => updateEntry(tableKey, i, "xpValue", parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 text-sm font-bold" />
              </div>
              <div>
                <label className="text-[10px] text-ink/40 font-bold">{entry.symbol !== undefined ? "Symbole" : "Couleur"}</label>
                <input value={entry.symbol || entry.color || ""}
                  onChange={e => updateEntry(tableKey, i, entry.symbol !== undefined ? "symbol" : "color", e.target.value)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 text-sm" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  async function runTest() {
    if (!testAddress) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/daily-test", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ address: testAddress }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ error: "Request failed" });
    }
    setTesting(false);
  }

  // RTP calculation — exclude jackpot (pool-based, not fixed CRC)
  const scratchRtp = editScratch.reduce((s, r) => s + r.prob * r.crcValue, 0);
  const spinRtp = editSpin.filter(r => r.type !== "jackpot").reduce((s, r) => s + r.prob * r.crcValue, 0);
  const jackpotProb = editSpin.find(r => r.type === "jackpot")?.prob || 0;
  const combinedRtp = scratchRtp + spinRtp;
  const rtpColor = combinedRtp > 1 ? "text-red-600 bg-red-100" : combinedRtp > 0.95 ? "text-amber-600 bg-amber-100" : "text-green-600 bg-green-100";

  return (
    <div className="space-y-8">
      {/* RTP Indicator */}
      <div className={`p-4 rounded-xl border-2 ${combinedRtp > 1 ? "border-red-300" : combinedRtp > 0.95 ? "border-amber-300" : "border-green-300"} space-y-2`}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink/40 uppercase tracking-widest">RTP combine (Scratch + Spin)</span>
          <span className={`text-lg font-black px-3 py-1 rounded-lg ${rtpColor}`}>
            {(combinedRtp * 100).toFixed(1)}%
          </span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs text-ink/50">
          <span>Scratch: {(scratchRtp * 100).toFixed(1)}%</span>
          <span>Spin: {(spinRtp * 100).toFixed(1)}%</span>
          <span>Mise: 1 CRC</span>
          <span>Gain moyen: {combinedRtp.toFixed(3)} CRC</span>
          {jackpotProb > 0 && <span>Jackpot: {(jackpotProb * 100).toFixed(2)}% (pool, hors RTP)</span>}
        </div>
        {combinedRtp > 1 && <p className="text-xs text-red-600 font-semibold">Tu perds de l argent ! Le RTP depasse 100%. Sauvegarde bloquee.</p>}
        {combinedRtp < 0.97 && <p className="text-xs text-red-600 font-semibold">RTP trop bas (min 97%). Sauvegarde bloquee.</p>}
        {combinedRtp >= 0.97 && combinedRtp <= 1 && <p className="text-xs text-green-600 font-semibold">Marge plateforme : {((1 - combinedRtp) * 100).toFixed(1)}%</p>}
      </div>

      <RewardTable title="Scratch Card — Tableau de gains" tableKey="scratch" entries={editScratch} />
      <RewardTable title="Roue — Segments" tableKey="spin" entries={editSpin} />

      {/* Test mode */}
      <div className="p-4 rounded-xl border-2 border-dashed border-amber-300/50 bg-amber-50/30 dark:bg-amber-900/10 space-y-3">
        <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">Test Daily (vrai payout, sans payer 1 CRC)</p>
        <div className="flex gap-2">
          <input placeholder="Adresse 0x..." value={testAddress} onChange={e => setTestAddress(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg border border-ink/10 text-sm font-mono" />
          <button onClick={runTest} disabled={testing || !testAddress}
            className="px-4 py-2 rounded-lg bg-amber-500 text-white text-sm font-bold hover:opacity-90 disabled:opacity-50">
            {testing ? "Test..." : "Lancer"}
          </button>
        </div>
        {testResult && (
          <div className="p-3 rounded-xl bg-white/80 dark:bg-white/5 border border-ink/5 space-y-2 text-sm">
            {testResult.error ? (
              <p className="text-red-500">{testResult.error}</p>
            ) : (
              <>
                <p className="font-bold text-ink dark:text-white">Scratch : {testResult.scratch?.result?.label}
                  {testResult.scratch?.result?.crcValue > 0 && <span className="text-emerald-600"> → {testResult.scratch.result.crcValue} CRC envoye</span>}
                  {testResult.scratch?.result?.xpValue > 0 && <span className="text-violet-600"> → +{testResult.scratch.result.xpValue} XP</span>}
                  {testResult.scratch?.payout?.error && <span className="text-red-500"> (payout erreur: {testResult.scratch.payout.error})</span>}
                </p>
                <p className="font-bold text-ink dark:text-white">Spin : {testResult.spin?.result?.label}
                  {testResult.spin?.result?.crcValue > 0 && <span className="text-emerald-600"> → {testResult.spin.result.crcValue} CRC envoye</span>}
                  {testResult.spin?.result?.xpValue > 0 && <span className="text-violet-600"> → +{testResult.spin.result.xpValue} XP</span>}
                  {testResult.spin?.payout?.error && <span className="text-red-500"> (payout erreur: {testResult.spin.payout.error})</span>}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Badges Tab ─── */

const CONDITION_TYPES = [
  { value: "manual", label: "Attribuer manuellement", desc: "Tu choisis a qui donner ce badge", needsAction: false, needsValue: false },
  { value: "first", label: "Premiere fois", desc: "Quand le joueur fait cette action pour la 1ere fois", needsAction: true, needsValue: false },
  { value: "streak", label: "Serie consecutive", desc: "X jours de suite ou X victoires de suite", needsAction: true, needsValue: true, valueLabel: "Combien de fois de suite ?" },
  { value: "count", label: "Compteur total", desc: "Quand le joueur atteint X fois au total", needsAction: true, needsValue: true, valueLabel: "Combien de fois ?" },
  { value: "xp_threshold", label: "Seuil d'XP", desc: "Quand le joueur atteint X XP au total", needsAction: false, needsValue: true, valueLabel: "Combien d'XP ?" },
  { value: "level_threshold", label: "Seuil de niveau", desc: "Quand le joueur atteint le niveau X", needsAction: false, needsValue: true, valueLabel: "Quel niveau ?" },
  { value: "games_played", label: "Parties jouees", desc: "Quand le joueur a joue X parties au total", needsAction: false, needsValue: true, valueLabel: "Combien de parties ?" },
  { value: "games_won", label: "Victoires totales", desc: "Quand le joueur a gagne X parties au total", needsAction: false, needsValue: true, valueLabel: "Combien de victoires ?" },
  { value: "crc_won", label: "CRC gagnes", desc: "Quand le joueur a gagne X CRC au total", needsAction: false, needsValue: true, valueLabel: "Combien de CRC ?" },
  { value: "hour_before", label: "Heure matinale", desc: "Quand le joueur se connecte avant Xh du matin", needsAction: true, needsValue: true, valueLabel: "Avant quelle heure ?" },
  { value: "hour_between", label: "Plage horaire", desc: "Quand le joueur se connecte entre Xh et Yh", needsAction: true, needsValue: false },
  { value: "lose_streak", label: "Serie de defaites", desc: "Quand le joueur perd X fois de suite", needsAction: true, needsValue: true, valueLabel: "Combien de defaites ?" },
  { value: "multi_game", label: "Multi-jeu", desc: "Quand le joueur a joue a X jeux differents", needsAction: false, needsValue: true, valueLabel: "Combien de jeux ?" },
];

const ACTION_EXAMPLES = [
  { value: "*_win", label: "Gagner (tous les jeux)" },
  { value: "*_lose", label: "Perdre (tous les jeux)" },
  { value: "morpion_win", label: "Gagner au Morpion" },
  { value: "pfc_win", label: "Gagner au PFC" },
  { value: "dames_win", label: "Gagner aux Dames" },
  { value: "relics_win", label: "Gagner a Relics" },
  { value: "memory_win", label: "Gagner au Memory" },
  { value: "daily_checkin", label: "Check-in quotidien" },
  { value: "lootbox_open", label: "Ouvrir une lootbox" },
];

const CATEGORY_OPTIONS = [
  { value: "game", label: "🎮 Jeu", desc: "Lie aux jeux multijoueur" },
  { value: "activity", label: "📊 Activite", desc: "Lie a l'activite generale" },
  { value: "event", label: "🎉 Evenement", desc: "Evenement special / temporaire" },
  { value: "secret", label: "🔒 Secret", desc: "Cache jusqu'a deblocage" },
];

const BADGE_CATEGORIES = ["game", "activity", "event", "secret"];

interface BadgeRow {
  id: number; slug: string; name: string; description: string; icon: string;
  iconType: string; category: string; secret: boolean;
  condition: { type: string; action?: string; value?: number; min?: number; max?: number } | null;
}

function BadgesTab({ password }: { password: string }) {
  const [allBadges, setBadges] = useState<BadgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<BadgeRow>>({});
  const [showNew, setShowNew] = useState(false);
  const [newBadge, setNewBadge] = useState({
    slug: "", name: "", description: "", icon: "🏆", category: "game", secret: false,
    condition: { type: "manual" as string, action: "", value: 1, min: 0, max: 4 },
  });
  const [saving, setSaving] = useState(false);
  const [awardAddress, setAwardAddress] = useState("");
  const [awardSlug, setAwardSlug] = useState("");
  const [awarding, setAwarding] = useState(false);
  const [awardMsg, setAwardMsg] = useState("");

  const fetchBadges = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/badges", { headers: { "x-admin-password": password } });
      const data = await res.json();
      setBadges(data.badges || []);
    } catch {}
    setLoading(false);
  }, [password]);

  useEffect(() => { fetchBadges(); }, [fetchBadges]);

  async function createBadge() {
    if (!newBadge.slug || !newBadge.name) return;
    setSaving(true);
    try {
      const condition: Record<string, unknown> = { type: newBadge.condition.type };
      if (newBadge.condition.type !== "manual") {
        if (newBadge.condition.action) condition.action = newBadge.condition.action;
        if (["streak", "count", "hour_before", "lose_streak", "xp_threshold", "level_threshold", "games_played", "games_won", "crc_won", "multi_game"].includes(newBadge.condition.type)) condition.value = newBadge.condition.value;
        if (newBadge.condition.type === "hour_between") { condition.min = newBadge.condition.min; condition.max = newBadge.condition.max; }
      }
      const res = await fetch("/api/admin/badges", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ ...newBadge, condition }),
      });
      if (res.ok) {
        setShowNew(false);
        setNewBadge({ slug: "", name: "", description: "", icon: "🏆", category: "game", secret: false, condition: { type: "manual", action: "", value: 1, min: 0, max: 4 } });
        await fetchBadges();
      } else { const d = await res.json(); alert(d.error); }
    } catch {}
    setSaving(false);
  }

  async function updateBadge(slug: string) {
    setSaving(true);
    try {
      await fetch("/api/admin/badges", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ slug, ...editData }),
      });
      setEditing(null); setEditData({});
      await fetchBadges();
    } catch {}
    setSaving(false);
  }

  async function deleteBadge(slug: string) {
    if (!confirm(`Supprimer "${slug}" et tous ses awards ?`)) return;
    await fetch("/api/admin/badges", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ slug }),
    });
    await fetchBadges();
  }

  async function awardBadge() {
    if (!awardAddress || !awardSlug) return;
    setAwarding(true);
    const res = await fetch("/api/admin/badges/award", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-password": password },
      body: JSON.stringify({ address: awardAddress, badgeSlug: awardSlug }),
    });
    setAwardMsg(res.ok ? "Badge attribue !" : "Erreur");
    setTimeout(() => setAwardMsg(""), 3000);
    setAwarding(false);
  }

  function conditionLabel(c: BadgeRow["condition"]): string {
    if (!c) return "—";
    const labels: Record<string, string> = {
      manual: "Manuel", first: `1ere: ${c.action || "?"}`, streak: `Streak ${c.value}x: ${c.action || "?"}`,
      count: `${c.value}x: ${c.action || "?"}`, hour_before: `Avant ${c.value}h`,
      hour_between: `${c.min}h-${c.max}h`, lose_streak: `${c.value} defaites: ${c.action || "?"}`,
      xp_threshold: `${c.value} XP`, level_threshold: `Niveau ${c.value}`,
      games_played: `${c.value} parties`, games_won: `${c.value} victoires`,
      crc_won: `${c.value} CRC gagnes`, multi_game: `${c.value} jeux differents`,
    };
    return labels[c.type] || c.type;
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink/30" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-ink/40 uppercase tracking-widest">Badges ({allBadges.length})</h3>
        <button onClick={() => setShowNew(!showNew)} className="px-3 py-1 rounded-lg bg-marine text-white text-xs font-bold hover:opacity-90">
          {showNew ? "Annuler" : "+ Nouveau"}
        </button>
      </div>

      {/* New badge form */}
      {showNew && (() => {
        const condType = CONDITION_TYPES.find(t => t.value === newBadge.condition.type);
        const conditionSummary = (() => {
          if (newBadge.condition.type === "manual") return "Tu l'attribues manuellement a qui tu veux.";
          const actionLabel = ACTION_EXAMPLES.find(a => a.value === newBadge.condition.action)?.label || newBadge.condition.action || "...";
          if (newBadge.condition.type === "first") return `Se debloque la premiere fois que le joueur fait : ${actionLabel}`;
          if (newBadge.condition.type === "streak") return `Se debloque apres ${newBadge.condition.value} ${actionLabel} de suite`;
          if (newBadge.condition.type === "count") return `Se debloque apres ${newBadge.condition.value} fois : ${actionLabel}`;
          if (newBadge.condition.type === "xp_threshold") return `Se debloque quand le joueur atteint ${newBadge.condition.value} XP`;
          if (newBadge.condition.type === "level_threshold") return `Se debloque quand le joueur atteint le niveau ${newBadge.condition.value}`;
          if (newBadge.condition.type === "games_played") return `Se debloque apres ${newBadge.condition.value} parties jouees`;
          if (newBadge.condition.type === "games_won") return `Se debloque apres ${newBadge.condition.value} victoires`;
          if (newBadge.condition.type === "crc_won") return `Se debloque apres ${newBadge.condition.value} CRC gagnes`;
          if (newBadge.condition.type === "hour_before") return `Se debloque si check-in avant ${newBadge.condition.value}h`;
          if (newBadge.condition.type === "hour_between") return `Se debloque si check-in entre ${newBadge.condition.min}h et ${newBadge.condition.max}h`;
          if (newBadge.condition.type === "lose_streak") return `Se debloque apres ${newBadge.condition.value} defaites de suite`;
          if (newBadge.condition.type === "multi_game") return `Se debloque quand le joueur a joue a ${newBadge.condition.value} jeux differents`;
          return "";
        })();

        return (
        <div className="p-5 rounded-2xl border-2 border-marine/20 bg-white/40 dark:bg-white/5 space-y-5">
          {/* Preview */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-ink/[0.03] dark:bg-white/5 border border-ink/5">
            <div className="w-14 h-14 rounded-xl bg-white dark:bg-white/10 flex items-center justify-center text-3xl shadow-sm">
              {newBadge.icon || "🏆"}
            </div>
            <div className="flex-1">
              <p className="font-bold text-ink dark:text-white">{newBadge.name || "Nom du badge"}</p>
              <p className="text-xs text-ink/50">{newBadge.description || "Description..."}</p>
              <p className="text-[10px] text-marine font-semibold mt-0.5">{conditionSummary}</p>
            </div>
            {newBadge.secret && <span className="text-xs bg-ink/10 px-2 py-0.5 rounded-full">🔒 Secret</span>}
          </div>

          {/* Step 1: Identity */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-ink/60 uppercase tracking-widest">1. Identite du badge</p>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <input value={newBadge.icon} onChange={e => setNewBadge(p => ({ ...p, icon: e.target.value }))}
                className="px-3 py-3 rounded-xl border border-ink/10 text-center text-2xl bg-white dark:bg-white/10" placeholder="🏆" />
              <input placeholder="Nom du badge (ex: Champion)" value={newBadge.name}
                onChange={e => setNewBadge(p => ({ ...p, name: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") }))}
                className="px-3 py-3 rounded-xl border border-ink/10 text-sm font-semibold" />
            </div>
            <input placeholder="Description (ex: Gagner 10 parties)" value={newBadge.description}
              onChange={e => setNewBadge(p => ({ ...p, description: e.target.value }))}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/10 text-sm" />
          </div>

          {/* Step 2: Category */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-ink/60 uppercase tracking-widest">2. Categorie</p>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORY_OPTIONS.map(c => (
                <button key={c.value} onClick={() => setNewBadge(p => ({ ...p, category: c.value, secret: c.value === "secret" }))}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    newBadge.category === c.value ? "border-marine bg-marine/5" : "border-ink/10 hover:border-ink/20"
                  }`}>
                  <p className="text-sm font-bold">{c.label}</p>
                  <p className="text-[10px] text-ink/40">{c.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Step 3: Condition */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-ink/60 uppercase tracking-widest">3. Comment debloquer ce badge ?</p>
            <div className="grid grid-cols-2 gap-2">
              {CONDITION_TYPES.map(t => (
                <button key={t.value} onClick={() => setNewBadge(p => ({ ...p, condition: { ...p.condition, type: t.value } }))}
                  className={`p-2.5 rounded-xl border-2 text-left transition-all ${
                    newBadge.condition.type === t.value ? "border-marine bg-marine/5" : "border-ink/10 hover:border-ink/20"
                  }`}>
                  <p className="text-xs font-bold">{t.label}</p>
                  <p className="text-[10px] text-ink/40">{t.desc}</p>
                </button>
              ))}
            </div>

            {/* Action selector */}
            {condType?.needsAction && (
              <div className="space-y-1">
                <p className="text-[10px] text-ink/40 font-bold">Quelle action ?</p>
                <select value={newBadge.condition.action}
                  onChange={e => setNewBadge(p => ({ ...p, condition: { ...p.condition, action: e.target.value } }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-ink/10 text-sm">
                  <option value="">Choisir une action...</option>
                  {ACTION_EXAMPLES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
            )}

            {/* Value input */}
            {condType?.needsValue && (
              <div className="space-y-1">
                <p className="text-[10px] text-ink/40 font-bold">{condType.valueLabel}</p>
                <input type="number" min={1} value={newBadge.condition.value}
                  onChange={e => setNewBadge(p => ({ ...p, condition: { ...p.condition, value: parseInt(e.target.value) || 1 } }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-ink/10 text-sm font-bold" />
              </div>
            )}

            {/* Hour between */}
            {newBadge.condition.type === "hour_between" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <p className="text-[10px] text-ink/40 font-bold">De (heure)</p>
                  <input type="number" min={0} max={23} value={newBadge.condition.min}
                    onChange={e => setNewBadge(p => ({ ...p, condition: { ...p.condition, min: parseInt(e.target.value) || 0 } }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-ink/10 text-sm font-bold" />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-ink/40 font-bold">A (heure)</p>
                  <input type="number" min={0} max={24} value={newBadge.condition.max}
                    onChange={e => setNewBadge(p => ({ ...p, condition: { ...p.condition, max: parseInt(e.target.value) || 4 } }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-ink/10 text-sm font-bold" />
                </div>
              </div>
            )}
          </div>

          {/* Create button */}
          <button onClick={createBadge} disabled={saving || !newBadge.name || !newBadge.description}
            className="w-full py-3 rounded-xl bg-marine text-white text-sm font-bold hover:opacity-90 disabled:opacity-50">
            {saving ? "Creation..." : `Creer "${newBadge.name || "..."}"`}
          </button>
        </div>
        );
      })()}

      {/* Badge list */}
      {allBadges.map(badge => (
        <div key={badge.slug} className="p-4 rounded-xl bg-white/60 dark:bg-white/5 border border-ink/5 space-y-2">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{badge.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-ink dark:text-white">{badge.name}</p>
              <p className="text-[10px] text-ink/30 font-mono">{badge.slug} · {badge.category}{badge.secret ? " · 🔒" : ""}</p>
            </div>
            <span className="text-[10px] text-ink/40 bg-ink/5 px-2 py-0.5 rounded-full">{conditionLabel(badge.condition)}</span>
          </div>
          <p className="text-xs text-ink/50">{badge.description}</p>
          <div className="flex gap-2">
            <button onClick={() => { setEditing(badge.slug); setEditData({ name: badge.name, description: badge.description, icon: badge.icon }); }}
              className="text-xs px-2 py-1 rounded-lg border border-ink/10 text-ink/50 hover:text-ink">Modifier</button>
            <button onClick={() => deleteBadge(badge.slug)}
              className="text-xs px-2 py-1 rounded-lg border border-red-200 text-red-400 hover:text-red-600">Supprimer</button>
          </div>
          {editing === badge.slug && (
            <div className="p-3 rounded-lg bg-ink/[0.03] space-y-2 mt-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={editData.name || ""} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} className="px-2 py-1 rounded-lg border border-ink/10 text-sm" placeholder="Nom" />
                <input value={editData.icon || ""} onChange={e => setEditData(p => ({ ...p, icon: e.target.value }))} className="px-2 py-1 rounded-lg border border-ink/10 text-sm text-xl text-center" placeholder="Emoji" />
              </div>
              <input value={editData.description || ""} onChange={e => setEditData(p => ({ ...p, description: e.target.value }))} className="w-full px-2 py-1 rounded-lg border border-ink/10 text-sm" placeholder="Description" />
              <div className="flex gap-2">
                <button onClick={() => updateBadge(badge.slug)} disabled={saving} className="px-3 py-1 rounded-lg bg-marine text-white text-xs font-bold">{saving ? "..." : "Sauvegarder"}</button>
                <button onClick={() => { setEditing(null); setEditData({}); }} className="px-3 py-1 rounded-lg border border-ink/10 text-xs text-ink/50">Annuler</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Manual award */}
      <div className="p-4 rounded-xl border-2 border-dashed border-amber-300/50 bg-amber-50/30 dark:bg-amber-900/10 space-y-3">
        <p className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">Attribuer manuellement</p>
        <div className="grid grid-cols-2 gap-2">
          <input placeholder="Adresse 0x..." value={awardAddress} onChange={e => setAwardAddress(e.target.value)} className="px-3 py-2 rounded-lg border border-ink/10 text-sm font-mono" />
          <select value={awardSlug} onChange={e => setAwardSlug(e.target.value)} className="px-3 py-2 rounded-lg border border-ink/10 text-sm">
            <option value="">Choisir...</option>
            {allBadges.map(b => <option key={b.slug} value={b.slug}>{b.icon} {b.name}</option>)}
          </select>
        </div>
        <button onClick={awardBadge} disabled={awarding || !awardAddress || !awardSlug} className="w-full py-2 rounded-lg bg-amber-500 text-white text-sm font-bold hover:opacity-90 disabled:opacity-50">
          {awarding ? "..." : "Attribuer"}
        </button>
        {awardMsg && <p className="text-xs text-center text-emerald-600 font-semibold">{awardMsg}</p>}
      </div>
    </div>
  );
}

/* ─── Reset Tab ─── */

interface ResetTarget { key: string; label: string; tables: string[] }

function ResetTab({ password }: { password: string }) {
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
    const expected = `RESET_${key.toUpperCase()}`;
    if (confirmInput[key] !== expected) return;
    setResetting(key);
    try {
      const res = await fetch("/api/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ target: key, confirm: expected }),
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
          Ces actions suppriment definitivement les donnees. Impossible de revenir en arriere.
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
              placeholder={`Tapez RESET_${target.key.toUpperCase()} pour confirmer`}
              value={confirmInput[target.key] || ""}
              onChange={e => setConfirmInput(prev => ({ ...prev, [target.key]: e.target.value }))}
              className="flex-1 px-3 py-2 rounded-lg border border-red-200 text-sm font-mono text-red-600 placeholder:text-red-300"
            />
            <button
              onClick={() => resetTarget(target.key)}
              disabled={resetting === target.key || confirmInput[target.key] !== `RESET_${target.key.toUpperCase()}`}
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
