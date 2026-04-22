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
