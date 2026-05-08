"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Loader2, Eye, EyeOff, Clock,
  Flag, Gift, Sparkles, Trash2, RefreshCw, Send,
  ChevronDown, ExternalLink, AlertCircle, CheckCircle, XCircle,
  Palette, Check, Archive, Calculator,
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
  const [draftVersion, setDraftVersion] = useState(0);
  const [budgetDailyCount, setBudgetDailyCount] = useState("100");
  const [budgetCrc, setBudgetCrc] = useState("");
  const [budgetXp, setBudgetXp] = useState("");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetMessage, setBudgetMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/daily", { headers: { "x-admin-password": password } });
      const data = await res.json();
      setScratch(data.scratch || []);
      setSpin(data.spin || []);
      setEditScratch(data.scratch || []);
      setEditSpin(data.spin || []);
      setDraftVersion(v => v + 1);
    } catch {}
    setLoading(false);
  }, [password]);

  const [testAddress, setTestAddress] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => { fetchData(); }, [fetchData]);

  function isEmptyReward(entry: DailyRewardEntry) {
    const type = entry.type.toLowerCase();
    const label = entry.label.toLowerCase();
    return entry.crcValue <= 0 && entry.xpValue <= 0 && (
      type === "nothing" ||
      type.startsWith("nothing_") ||
      label === "rien" ||
      label === "nothing"
    );
  }

  function roundProb(prob: number) {
    return Math.round(Math.max(0, prob) * 1_000_000_000) / 1_000_000_000;
  }

  function updateEntry(table: "scratch" | "spin", index: number, field: string, value: unknown) {
    const setter = table === "scratch" ? setEditScratch : setEditSpin;
    setter(prev => {
      const updated = prev.map((e, i) => i === index ? { ...e, [field]: value } : e);

      // Auto-balance: when changing a prob, adjust "nothing" (first entry) to keep total = 100%
      if (field === "prob") {
        const nothingIdx = updated.findIndex(isEmptyReward);
        if (nothingIdx >= 0 && nothingIdx !== index) {
          const othersTotal = updated.reduce((s, e, i) => i === nothingIdx ? s : s + e.prob, 0);
          const newNothingProb = Math.max(0, 1 - othersTotal);
          updated[nothingIdx] = { ...updated[nothingIdx], prob: roundProb(newNothingProb) };
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
    if (decimals === 0) return Math.round(value).toLocaleString("fr-FR");
    const fixed = value.toFixed(decimals);
    return fixed.replace(/\.?0+$/, "");
  }

  function formatProbabilityPercent(prob: number) {
    const pct = prob * 100;
    if (pct === 0) return "0";
    if (pct < 0.0001) return pct.toPrecision(3);
    if (pct < 0.01) return formatExpected(pct, 6);
    if (pct < 1) return formatExpected(pct, 4);
    return formatExpected(pct, 3);
  }

  function rebalanceEntries(table: "scratch" | "spin", entries: DailyRewardEntry[]) {
    const balanced: DailyRewardEntry[] = [];
    for (const entry of entries.map(entry => ({ ...entry, prob: roundProb(entry.prob) }))) {
      if (isEmptyReward(entry) && balanced.some(isEmptyReward)) continue;
      balanced.push(entry);
    }
    let emptyIdx = balanced.findIndex(isEmptyReward);

    if (emptyIdx < 0) {
      balanced.push({ ...createEntry(table, "nothing"), prob: 0 });
      emptyIdx = balanced.length - 1;
    }

    const positiveTotal = balanced.reduce((sum, entry, index) => index === emptyIdx ? sum : sum + entry.prob, 0);
    if (positiveTotal > 1.000001) {
      return {
        error: `${table === "scratch" ? "Scratch" : "Roue"} depasse 100% de probabilites positives. Baisse le budget ou augmente les montants de gains.`,
        entries: balanced,
      };
    }

    balanced[emptyIdx] = { ...balanced[emptyIdx], prob: roundProb(1 - positiveTotal) };
    return { entries: balanced };
  }

  function applyBudgetCalculator() {
    setBudgetError(null);
    setBudgetMessage(null);

    const hasCrcBudget = budgetCrc.trim() !== "";
    const hasXpBudget = budgetXp.trim() !== "";
    const dailyCount = Number(budgetDailyCount);
    const crcBudget = hasCrcBudget ? Number(budgetCrc) : null;
    const xpBudget = hasXpBudget ? Number(budgetXp) : null;

    if (!hasCrcBudget && !hasXpBudget) {
      setBudgetError("Entre au moins un budget CRC ou XP. Pour couper les gains, mets explicitement 0.");
      return;
    }
    if (!Number.isFinite(dailyCount) || dailyCount <= 0) {
      setBudgetError("Entre un nombre de daily joues superieur a 0.");
      return;
    }
    if ((hasCrcBudget && (!Number.isFinite(crcBudget) || crcBudget! < 0)) || (hasXpBudget && (!Number.isFinite(xpBudget) || xpBudget! < 0))) {
      setBudgetError("Les budgets CRC et XP doivent etre des nombres positifs.");
      return;
    }

    const targetCrcEv = hasCrcBudget ? crcBudget! / dailyCount : combinedCrcEv;
    const targetXpEv = hasXpBudget ? xpBudget! / dailyCount : combinedXpEv;

    if (hasCrcBudget && targetCrcEv > 0 && combinedCrcEv <= 0) {
      setBudgetError("Ajoute au moins une ligne de gain CRC avant de calculer un budget CRC.");
      return;
    }
    if (hasXpBudget && targetXpEv > 0 && combinedXpEv <= 0) {
      setBudgetError("Ajoute au moins une ligne de gain XP avant de calculer un budget XP.");
      return;
    }

    const crcScale = hasCrcBudget ? (combinedCrcEv > 0 ? targetCrcEv / combinedCrcEv : 0) : 1;
    const xpScale = hasXpBudget ? (combinedXpEv > 0 ? targetXpEv / combinedXpEv : 0) : 1;

    const scaleEntries = (entries: DailyRewardEntry[]) => entries.map(entry => {
      if (isEmptyReward(entry)) return { ...entry, prob: 0 };

      const scales = [
        entry.crcValue > 0 && hasCrcBudget ? crcScale : null,
        entry.xpValue > 0 && hasXpBudget ? xpScale : null,
      ].filter((scale): scale is number => scale !== null);
      const factor = scales.length > 0 ? Math.min(...scales) : 1;
      return { ...entry, prob: roundProb(entry.prob * factor) };
    });

    const nextScratch = rebalanceEntries("scratch", scaleEntries(editScratch));
    if (nextScratch.error) {
      setBudgetError(nextScratch.error);
      return;
    }

    const nextSpin = rebalanceEntries("spin", scaleEntries(editSpin));
    if (nextSpin.error) {
      setBudgetError(nextSpin.error);
      return;
    }

    setEditScratch(nextScratch.entries);
    setEditSpin(nextSpin.entries);
    setDraftVersion(v => v + 1);
    setBudgetMessage("Probas recalculees. Verifie le resultat puis sauvegarde Scratch et Roue pour publier.");
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink/30" /></div>;

  function RewardTable({ title, tableKey, entries }: { title: string; tableKey: "scratch" | "spin"; entries: DailyRewardEntry[] }) {
    const total = totalProb(entries);
    const isValid = Math.abs(total - 1.0) <= 0.01;

    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-xs font-bold text-ink/65 uppercase tracking-widest dark:text-white/70">{title}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => addEntry(tableKey, "xp")}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/25"
            >
              <Sparkles className="h-3 w-3" />
              Ajouter XP
            </button>
            <button
              onClick={() => addEntry(tableKey, "crc")}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25"
            >
              <Gift className="h-3 w-3" />
              Ajouter CRC
            </button>
            <button
              onClick={() => addEntry(tableKey, "nothing")}
              className="rounded-lg bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-ink/65 hover:bg-ink/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
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
          <div key={entry.type || i} className="p-3 rounded-xl bg-white/90 dark:bg-zinc-950/70 border border-ink/10 dark:border-white/10 space-y-2 shadow-sm">
            <div className="flex items-center gap-2">
              {tableKey === "scratch" ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink/5 text-xl">{entry.symbol || "?"}</span>
              ) : (
                <span className="h-8 w-8 rounded-lg border border-white/70 shadow-sm" style={{ backgroundColor: entry.color || "#6B7280" }} />
              )}
              <input value={entry.label} onChange={e => updateEntry(tableKey, i, "label", e.target.value)}
                className="flex-1 px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm font-semibold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white" />
              <button
                onClick={() => removeEntry(tableKey, i)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-ink/55 hover:bg-red-100 hover:text-red-600 dark:text-white/45 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                aria-label="Supprimer cette ligne"
                title="Supprimer cette ligne"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label className="text-[10px] text-ink/60 font-bold dark:text-white/60">Type</label>
                <input value={entry.type}
                  onChange={e => updateEntry(tableKey, i, "type", e.target.value)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm font-mono text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white" />
              </div>
              <div>
                <label className="text-[10px] text-ink/60 font-bold dark:text-white/60">Prob %</label>
                <input type="text" inputMode="decimal"
                  defaultValue={formatProbabilityPercent(entry.prob)}
                  key={`prob-${tableKey}-${i}-${entries.length}-${draftVersion}`}
                  onBlur={e => updateEntry(tableKey, i, "prob", (parseFloat(e.target.value) || 0) / 100)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white" />
              </div>
              <div>
                <label className="text-[10px] text-ink/60 font-bold dark:text-white/60">CRC</label>
                <input type="number" step="0.1" min={0}
                  defaultValue={entry.crcValue}
                  key={`crc-${tableKey}-${i}-${entries.length}-${draftVersion}`}
                  onBlur={e => updateEntry(tableKey, i, "crcValue", parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white" />
              </div>
              <div>
                <label className="text-[10px] text-ink/60 font-bold dark:text-white/60">XP</label>
                <input type="number" step="1" min={0}
                  defaultValue={entry.xpValue}
                  key={`xp-${tableKey}-${i}-${entries.length}-${draftVersion}`}
                  onBlur={e => updateEntry(tableKey, i, "xpValue", parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white" />
              </div>
              <div>
                <label className="text-[10px] text-ink/60 font-bold dark:text-white/60">{tableKey === "scratch" ? "Symbole" : "Couleur"}</label>
                <input value={entry.symbol || entry.color || ""}
                  onChange={e => updateEntry(tableKey, i, tableKey === "scratch" ? "symbol" : "color", e.target.value)}
                  className="w-full px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-ink/55 dark:text-white/55">
              <span>EV ligne: {(entry.prob * entry.xpValue).toFixed(2)} XP</span>
              <span>{formatExpected(entry.prob * entry.crcValue, 6)} CRC</span>
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
  const crcTone = combinedCrcEv > 0.05
    ? "text-red-700 bg-red-100 dark:text-red-200 dark:bg-red-500/20"
    : combinedCrcEv > 0.02
      ? "text-amber-700 bg-amber-100 dark:text-amber-200 dark:bg-amber-500/20"
      : "text-green-700 bg-green-100 dark:text-green-200 dark:bg-green-500/20";
  const dailyProjections = [
    { label: "100 daily joues", count: 100 },
    { label: "1 000 daily joues", count: 1000 },
  ];
  const hasCrcBudgetInput = budgetCrc.trim() !== "";
  const hasXpBudgetInput = budgetXp.trim() !== "";
  const budgetDailyNumber = Number(budgetDailyCount);
  const budgetCrcNumber = hasCrcBudgetInput ? Number(budgetCrc) : 0;
  const budgetXpNumber = hasXpBudgetInput ? Number(budgetXp) : 0;
  const hasBudgetInput = hasCrcBudgetInput || hasXpBudgetInput;
  const budgetPreviewValid =
    hasBudgetInput &&
    Number.isFinite(budgetDailyNumber) && budgetDailyNumber > 0 &&
    (!hasCrcBudgetInput || (Number.isFinite(budgetCrcNumber) && budgetCrcNumber >= 0)) &&
    (!hasXpBudgetInput || (Number.isFinite(budgetXpNumber) && budgetXpNumber >= 0));
  const budgetTargetCrcEv = budgetPreviewValid ? budgetCrcNumber / budgetDailyNumber : 0;
  const budgetTargetXpEv = budgetPreviewValid ? budgetXpNumber / budgetDailyNumber : 0;
  const budgetProjectionCount = Number.isFinite(budgetDailyNumber) && budgetDailyNumber > 0 ? budgetDailyNumber : 100;

  return (
    <div className="space-y-8">
      <div className={`p-4 rounded-xl border-2 bg-gradient-to-br from-white via-amber-50/50 to-emerald-50/40 shadow-sm dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 ${combinedCrcEv > 0.05 ? "border-red-300 dark:border-red-500/50" : combinedCrcEv > 0.02 ? "border-amber-300 dark:border-amber-500/50" : "border-green-300 dark:border-green-500/50"} space-y-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="text-xs font-bold text-ink/70 uppercase tracking-widest dark:text-white/75">Gain moyen attendu</span>
            <p className="mt-1 text-sm text-ink/70 dark:text-white/70">
              Estimation statistique pour <strong>1 daily complet</strong> (scratch + roue). Ce n'est pas un gain garanti joueur par joueur.
            </p>
          </div>
          <span className={`text-lg font-black px-3 py-1 rounded-lg ${crcTone}`}>
            {formatExpected(combinedCrcEv)} CRC / daily
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-ink/10 bg-white/90 p-3 shadow-sm dark:border-white/10 dark:bg-zinc-950/70">
            <p className="text-[10px] font-black uppercase tracking-widest text-ink/60 dark:text-white/60">Par 1 daily joue</p>
            <p className="mt-1 text-sm font-bold text-ink dark:text-white">{combinedXpEv.toFixed(1)} XP moyen</p>
            <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">{formatExpected(combinedCrcEv)} CRC moyen</p>
            <p className="mt-1 text-xs text-ink/60 dark:text-white/60">{(crcHitRate * 100).toFixed(2)}% de chance de toucher au moins 1 CRC</p>
          </div>
          {dailyProjections.map((projection) => (
            <div key={projection.count} className="rounded-lg border border-ink/10 bg-white/90 p-3 shadow-sm dark:border-white/10 dark:bg-zinc-950/70">
              <p className="text-[10px] font-black uppercase tracking-widest text-ink/60 dark:text-white/60">{projection.label}</p>
              <p className="mt-1 text-sm font-bold text-ink dark:text-white">
                ~{formatExpected(combinedXpEv * projection.count, 0)} XP distribues
              </p>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                ~{formatExpected(combinedCrcEv * projection.count)} CRC distribues
              </p>
              <p className="mt-1 text-xs text-ink/60 dark:text-white/60">Projection moyenne, les resultats reels peuvent varier.</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-ink/65 dark:text-white/65">
          <span>Detail scratch: {scratchXpEv.toFixed(1)} XP / {formatExpected(scratchCrcEv)} CRC par daily</span>
          <span>Detail roue: {spinXpEv.toFixed(1)} XP / {formatExpected(spinCrcEv)} CRC par daily</span>
          <span>Formule: gain moyen = gain configure x probabilite</span>
        </div>
        {combinedCrcEv > 0.05 && <p className="text-xs text-red-700 font-semibold dark:text-red-300">Attention: gain CRC moyen eleve pour un daily gratuit.</p>}
        {combinedCrcEv <= 0.05 && <p className="text-xs text-green-700 font-semibold dark:text-green-300">Les CRC restent rares; l'XP porte la recompense principale.</p>}
      </div>

      <div className="rounded-xl border border-marine/15 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-marine dark:text-cyan-300" />
              <h3 className="text-sm font-black uppercase tracking-widest text-ink dark:text-white">Calculateur de budget daily</h3>
            </div>
            <p className="mt-1 text-sm text-ink/70 dark:text-white/70">
              Entre ce que tu peux distribuer sur une journee. Le calculateur ajuste les probabilites XP/CRC et met le reste sur les lignes vides.
            </p>
            <p className="mt-1 text-xs font-semibold text-ink/55 dark:text-white/55">
              Laisse un champ budget vide pour ne pas modifier cette famille. Mets 0 pour la couper volontairement.
            </p>
          </div>
          <button
            onClick={applyBudgetCalculator}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-marine px-3 py-2 text-xs font-bold text-white hover:opacity-90"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Appliquer aux probas
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-ink/60 dark:text-white/60">Daily estimes / jour</label>
            <input
              type="number"
              min={1}
              step={1}
              value={budgetDailyCount}
              onChange={e => setBudgetDailyCount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-ink/60 dark:text-white/60">Budget CRC / jour</label>
            <input
              type="number"
              min={0}
              step="0.001"
              value={budgetCrc}
              onChange={e => setBudgetCrc(e.target.value)}
              placeholder={formatExpected(combinedCrcEv * budgetProjectionCount)}
              className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-ink/60 dark:text-white/60">Budget XP / jour</label>
            <input
              type="number"
              min={0}
              step={1}
              value={budgetXp}
              onChange={e => setBudgetXp(e.target.value)}
              placeholder={formatExpected(combinedXpEv * budgetProjectionCount, 0)}
              className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-3 rounded-lg bg-ink/[0.03] p-3 text-xs text-ink/70 dark:bg-white/10 dark:text-white/70">
          {budgetPreviewValid ? (
            <span>
              Cible calculee:{" "}
              <strong>{hasXpBudgetInput ? `${formatExpected(budgetTargetXpEv, 2)} XP` : "XP inchange"}</strong>
              {" "}et{" "}
              <strong>{hasCrcBudgetInput ? `${formatExpected(budgetTargetCrcEv)} CRC` : "CRC inchange"}</strong>
              {" "}en moyenne par daily complet.
            </span>
          ) : (
            <span>Entre des valeurs valides pour voir la cible moyenne par daily.</span>
          )}
        </div>
        {budgetError && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {budgetError}
          </p>
        )}
        {budgetMessage && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-green-50 p-3 text-xs font-semibold text-green-700 dark:bg-green-500/10 dark:text-green-300">
            <CheckCircle className="h-4 w-4 shrink-0" />
            {budgetMessage}
          </p>
        )}
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
          <div className="p-3 rounded-xl bg-white/90 dark:bg-zinc-950/70 border border-ink/10 dark:border-white/10 space-y-2 text-sm shadow-sm">
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
