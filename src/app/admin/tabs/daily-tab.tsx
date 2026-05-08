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

export function DailyTab({ password }: { password: string }) {
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

  function createEntry(table: "scratch" | "spin", kind: "xp" | "crc" | "nothing"): DailyRewardEntry {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const visual = table === "scratch"
      ? { symbol: kind === "crc" ? "💎" : kind === "xp" ? "✨" : "▫️" }
      : { color: kind === "crc" ? "#F59E0B" : kind === "xp" ? "#8B5CF6" : "#6B7280" };

    if (kind === "crc") {
      return {
        prob: 0.001,
        type: `crc_${id}`,
        label: "+1 CRC",
        crcValue: 1,
        xpValue: 0,
        ...visual,
      };
    }

    if (kind === "xp") {
      return {
        prob: 0.01,
        type: `xp_${id}`,
        label: "+10 XP",
        crcValue: 0,
        xpValue: 10,
        ...visual,
      };
    }

    return {
      prob: 0.01,
      type: `nothing_${id}`,
      label: "Rien",
      crcValue: 0,
      xpValue: 0,
      ...visual,
    };
  }

  function addEntry(table: "scratch" | "spin", kind: "xp" | "crc" | "nothing") {
    const setter = table === "scratch" ? setEditScratch : setEditSpin;
    setter(prev => [...prev, createEntry(table, kind)]);
  }

  function removeEntry(table: "scratch" | "spin", index: number) {
    const setter = table === "scratch" ? setEditScratch : setEditSpin;
    setter(prev => prev.filter((_, i) => i !== index));
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

  function formatExpected(value: number, decimals = 3) {
    const fixed = value.toFixed(decimals);
    return fixed.replace(/\.?0+$/, "");
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink/30" /></div>;

  function RewardTable({ title, tableKey, entries }: { title: string; tableKey: "scratch" | "spin"; entries: DailyRewardEntry[] }) {
    const total = totalProb(entries);
    const isValid = Math.abs(total - 1.0) <= 0.01;

    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xs font-bold text-ink/40 uppercase tracking-widest">{title}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => addEntry(tableKey, "xp")}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-200"
            >
              <Sparkles className="h-3 w-3" />
              Ajouter XP
            </button>
            <button
              onClick={() => addEntry(tableKey, "crc")}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200"
            >
              <Gift className="h-3 w-3" />
              Ajouter CRC
            </button>
            <button
              onClick={() => addEntry(tableKey, "nothing")}
              className="rounded-lg bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-ink/50 hover:bg-ink/10"
            >
              Ajouter vide
            </button>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isValid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              Total: {(total * 100).toFixed(1)}%
            </span>
            {hasChanges(tableKey) && (
              <button onClick={() => saveTable(tableKey)} disabled={saving === tableKey || !isValid}
                className="px-3 py-1 rounded-lg bg-marine text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
                title={!isValid ? "Le total des probabilites doit etre proche de 100%" : ""}>
                {saving === tableKey ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sauvegarder"}
              </button>
            )}
          </div>
        </div>

        {entries.map((entry, i) => (
          <div key={entry.type || i} className="p-3 rounded-xl bg-white/60 dark:bg-white/5 border border-ink/5 space-y-2">
            <div className="flex items-center gap-2">
              {tableKey === "scratch" ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/5 text-xl">{entry.symbol || "?"}</span>
              ) : (
                <span className="h-8 w-8 rounded-lg border border-white/70 shadow-sm" style={{ backgroundColor: entry.color || "#6B7280" }} />
              )}
              <input value={entry.label} onChange={e => updateEntry(tableKey, i, "label", e.target.value)}
                className="flex-1 px-2 py-1 rounded-lg border border-ink/10 text-sm font-semibold" />
              <button
                onClick={() => removeEntry(tableKey, i)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/35 hover:bg-red-100 hover:text-red-600"
                aria-label="Supprimer cette ligne"
                title="Supprimer cette ligne"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label className="text-[10px] text-ink/40 font-bold">Type</label>
                <input value={entry.type}
                  onChange={e => updateEntry(tableKey, i, "type", e.target.value)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 text-sm font-mono" />
              </div>
              <div>
                <label className="text-[10px] text-ink/40 font-bold">Prob %</label>
                <input type="text" inputMode="decimal"
                  defaultValue={entry.prob * 100}
                  key={`prob-${tableKey}-${i}-${entries.length}`}
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
                <label className="text-[10px] text-ink/40 font-bold">{tableKey === "scratch" ? "Symbole" : "Couleur"}</label>
                <input value={entry.symbol || entry.color || ""}
                  onChange={e => updateEntry(tableKey, i, tableKey === "scratch" ? "symbol" : "color", e.target.value)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 text-sm" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-ink/40">
              <span>EV ligne: {(entry.prob * entry.xpValue).toFixed(2)} XP</span>
              <span>{(entry.prob * entry.crcValue).toFixed(4)} CRC</span>
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

  // Expected value preview for the configurable daily rewards.
  const scratchCrcEv = editScratch.reduce((s, r) => s + r.prob * r.crcValue, 0);
  const spinCrcEv = editSpin.reduce((s, r) => s + r.prob * r.crcValue, 0);
  const scratchXpEv = editScratch.reduce((s, r) => s + r.prob * r.xpValue, 0);
  const spinXpEv = editSpin.reduce((s, r) => s + r.prob * r.xpValue, 0);
  const combinedCrcEv = scratchCrcEv + spinCrcEv;
  const combinedXpEv = scratchXpEv + spinXpEv;
  const scratchCrcChance = editScratch.filter(r => r.crcValue > 0).reduce((s, r) => s + r.prob, 0);
  const spinCrcChance = editSpin.filter(r => r.crcValue > 0).reduce((s, r) => s + r.prob, 0);
  const crcHitRate = 1 - (1 - scratchCrcChance) * (1 - spinCrcChance);
  const crcTone = combinedCrcEv > 0.05 ? "text-red-600 bg-red-100" : combinedCrcEv > 0.02 ? "text-amber-600 bg-amber-100" : "text-green-600 bg-green-100";
  const dailyProjections = [
    { label: "100 daily joues", count: 100 },
    { label: "1 000 daily joues", count: 1000 },
  ];

  return (
    <div className="space-y-8">
      <div className={`p-4 rounded-xl border-2 ${combinedCrcEv > 0.05 ? "border-red-300" : combinedCrcEv > 0.02 ? "border-amber-300" : "border-green-300"} space-y-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-xs font-bold text-ink/40 uppercase tracking-widest">Gain moyen attendu</span>
            <p className="mt-1 text-sm text-ink/60">
              Estimation statistique pour <strong>1 daily complet</strong> (scratch + roue). Ce n'est pas un gain garanti joueur par joueur.
            </p>
          </div>
          <span className={`text-lg font-black px-3 py-1 rounded-lg ${crcTone}`}>
            {formatExpected(combinedCrcEv)} CRC / daily
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-ink/5 bg-white/60 p-3 dark:bg-white/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-ink/35">Par 1 daily joue</p>
            <p className="mt-1 text-sm font-bold text-ink dark:text-white">{combinedXpEv.toFixed(1)} XP moyen</p>
            <p className="text-sm font-bold text-emerald-600">{formatExpected(combinedCrcEv)} CRC moyen</p>
            <p className="mt-1 text-xs text-ink/45">{(crcHitRate * 100).toFixed(2)}% de chance de toucher au moins 1 CRC</p>
          </div>
          {dailyProjections.map((projection) => (
            <div key={projection.count} className="rounded-lg border border-ink/5 bg-white/60 p-3 dark:bg-white/5">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink/35">{projection.label}</p>
              <p className="mt-1 text-sm font-bold text-ink dark:text-white">
                ~{formatExpected(combinedXpEv * projection.count, 0)} XP distribues
              </p>
              <p className="text-sm font-bold text-emerald-600">
                ~{formatExpected(combinedCrcEv * projection.count)} CRC distribues
              </p>
              <p className="mt-1 text-xs text-ink/45">Projection moyenne, les resultats reels peuvent varier.</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-ink/50">
          <span>Detail scratch: {scratchXpEv.toFixed(1)} XP / {formatExpected(scratchCrcEv)} CRC par daily</span>
          <span>Detail roue: {spinXpEv.toFixed(1)} XP / {formatExpected(spinCrcEv)} CRC par daily</span>
          <span>Formule: gain moyen = gain configure x probabilite</span>
        </div>
        {combinedCrcEv > 0.05 && <p className="text-xs text-red-600 font-semibold">Attention: gain CRC moyen eleve pour un daily gratuit.</p>}
        {combinedCrcEv <= 0.05 && <p className="text-xs text-green-600 font-semibold">Les CRC restent rares; l'XP porte la recompense principale.</p>}
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
