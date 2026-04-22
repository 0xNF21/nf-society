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

export function BadgesTab({ password }: { password: string }) {
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
