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

interface DailyRewardMetrics {
  crcEv: number;
  xpEv: number;
  crcChance: number;
  specialChance: number;
  nothingChance: number;
}

type DailyRewardTableKey = "scratch" | "spin";

interface DailyBudgetDraft {
  crc: string;
  xp: string;
  specialChance: string;
  maxNothingChance: string;
}

interface DailyBudgetTableProposal {
  table: DailyRewardTableKey;
  entries: DailyRewardEntry[];
  metrics: DailyRewardMetrics;
  optimizedSmallWins: boolean;
  warnings: string[];
  blockers: string[];
}

interface DailyBudgetPreview {
  draft: DailyBudgetDraft;
  hasCrcBudget: boolean;
  hasXpBudget: boolean;
  hasSpecialBudget: boolean;
  hasMaxNothingBudget: boolean;
  valid: boolean;
  targetCrcEv: number;
  targetXpEv: number;
  targetSpecialChance: number;
  targetMaxNothingChance: number;
}

interface DailyBudgetPanelProps {
  tableKey: DailyRewardTableKey;
  title: string;
  metrics: DailyRewardMetrics;
  preview: DailyBudgetPreview;
  proposal: DailyBudgetTableProposal | null;
  budgetProjectionCount: number;
  onPreview: (table: DailyRewardTableKey, optimizeSmallWins?: boolean) => void;
  onUpdateDraft: (table: DailyRewardTableKey, field: keyof DailyBudgetDraft, value: string) => void;
  onApplyProposal: (table: DailyRewardTableKey) => void;
  onAcceptNothingLimit: (table: DailyRewardTableKey) => void;
}

interface RewardTableProps {
  title: string;
  tableKey: DailyRewardTableKey;
  entries: DailyRewardEntry[];
  draftVersion: number;
  saving: string | null;
  hasChanges: boolean;
  onAddEntry: (table: DailyRewardTableKey, kind: "xp" | "crc" | "nothing") => void;
  onRemoveEntry: (table: DailyRewardTableKey, index: number) => void;
  onUpdateEntry: (table: DailyRewardTableKey, index: number, field: string, value: unknown) => void;
  onSave: (table: DailyRewardTableKey) => void;
}

const emptyBudgetDraft = (): DailyBudgetDraft => ({
  crc: "",
  xp: "",
  specialChance: "",
  maxNothingChance: "",
});

const emptyBudgetProposals = (): Record<DailyRewardTableKey, DailyBudgetTableProposal | null> => ({
  scratch: null,
  spin: null,
});

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

function isSpecialReward(entry: DailyRewardEntry) {
  return entry.crcValue <= 0 && entry.xpValue <= 0 && !isEmptyReward(entry);
}

function roundProb(prob: number) {
  return Math.round(Math.max(0, prob) * 1_000_000_000) / 1_000_000_000;
}

function totalProb(entries: DailyRewardEntry[]) {
  return entries.reduce((s, e) => s + e.prob, 0);
}

function getRewardMetrics(entries: DailyRewardEntry[]): DailyRewardMetrics {
  return {
    crcEv: entries.reduce((s, r) => s + r.prob * r.crcValue, 0),
    xpEv: entries.reduce((s, r) => s + r.prob * r.xpValue, 0),
    crcChance: entries.filter(r => r.crcValue > 0).reduce((s, r) => s + r.prob, 0),
    specialChance: entries.filter(isSpecialReward).reduce((s, r) => s + r.prob, 0),
    nothingChance: entries.filter(isEmptyReward).reduce((s, r) => s + r.prob, 0),
  };
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

function DailyBudgetPanel({
  tableKey,
  title,
  metrics,
  preview,
  proposal,
  budgetProjectionCount,
  onPreview,
  onUpdateDraft,
  onApplyProposal,
  onAcceptNothingLimit,
}: DailyBudgetPanelProps) {
  const proposalCanApply = Boolean(proposal && proposal.blockers.length === 0);
  const proposalNeedsHigherNothingLimit = Boolean(
    proposal &&
    preview.hasMaxNothingBudget &&
    preview.valid &&
    proposal.metrics.nothingChance > (preview.targetMaxNothingChance / 100) + 0.000000001
  );

  return (
    <section className="rounded-xl border border-ink/10 bg-ink/[0.025] p-3 dark:border-white/10 dark:bg-white/[0.04]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-ink dark:text-white">{title}</p>
          <p className="mt-1 text-xs font-semibold text-ink/65 dark:text-white/65">
            Actuel: {formatExpected(metrics.xpEv, 2)} XP / {formatExpected(metrics.crcEv)} CRC. Rien {formatProbabilityPercent(metrics.nothingChance)}%.
          </p>
        </div>
        <button
          onClick={() => onPreview(tableKey, false)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-marine px-3 py-2 text-xs font-bold text-white hover:opacity-90"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Previsualiser
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-ink/60 dark:text-white/60">Budget CRC / jour</label>
          <input
            type="number"
            min={0}
            step="0.001"
            value={preview.draft.crc}
            onChange={e => onUpdateDraft(tableKey, "crc", e.target.value)}
            placeholder={formatExpected(metrics.crcEv * budgetProjectionCount)}
            className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-ink/60 dark:text-white/60">Budget XP / jour</label>
          <input
            type="number"
            min={0}
            step={1}
            value={preview.draft.xp}
            onChange={e => onUpdateDraft(tableKey, "xp", e.target.value)}
            placeholder={formatExpected(metrics.xpEv * budgetProjectionCount, 0)}
            className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-ink/60 dark:text-white/60">Bonus speciaux (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.001"
            value={preview.draft.specialChance}
            onChange={e => onUpdateDraft(tableKey, "specialChance", e.target.value)}
            placeholder={formatProbabilityPercent(metrics.specialChance)}
            className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          />
        </div>
        <div>
          <label className="text-[10px] font-black uppercase tracking-widest text-ink/60 dark:text-white/60">Max rien (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.001"
            value={preview.draft.maxNothingChance}
            onChange={e => onUpdateDraft(tableKey, "maxNothingChance", e.target.value)}
            placeholder={formatProbabilityPercent(metrics.nothingChance)}
            className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
          />
        </div>
      </div>

      <div className="mt-3 rounded-lg bg-white/70 p-3 text-xs text-ink/70 dark:bg-zinc-950/70 dark:text-white/70">
        {preview.valid ? (
          <span>
            Cible {title}:{" "}
            <strong>{preview.hasXpBudget ? `${formatExpected(preview.targetXpEv, 2)} XP` : "XP inchange"}</strong>
            {" "}et{" "}
            <strong>{preview.hasCrcBudget ? `${formatExpected(preview.targetCrcEv)} CRC` : "CRC inchange"}</strong>
            {" "}par tirage. Bonus:{" "}
            <strong>{preview.hasSpecialBudget ? `${formatExpected(preview.targetSpecialChance, 3)}%` : "inchanges"}</strong>.
            {" "}Max rien:{" "}
            <strong>{preview.hasMaxNothingBudget ? `${formatExpected(preview.targetMaxNothingChance, 3)}%` : "non limite"}</strong>.
          </span>
        ) : (
          <span>Entre des valeurs valides pour voir la cible {title.toLowerCase()}.</span>
        )}
      </div>

      {proposal && (
        <div className="mt-3 rounded-xl border border-marine/15 bg-sky-50/70 p-3 shadow-sm dark:border-cyan-400/20 dark:bg-cyan-950/20">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-marine dark:text-cyan-200">Proposition {title}</p>
              <p className="mt-1 text-sm font-semibold text-ink dark:text-white">
                {formatExpected(proposal.metrics.xpEv, 2)} XP et {formatExpected(proposal.metrics.crcEv)} CRC en moyenne par tirage.
              </p>
              <p className="mt-1 text-xs font-semibold text-ink/70 dark:text-white/75">
                Rien: {formatProbabilityPercent(proposal.metrics.nothingChance)}%. Bonus speciaux: {formatProbabilityPercent(proposal.metrics.specialChance)}%.
              </p>
            </div>
            <div className="grid min-w-[220px] grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-ink/10 bg-white p-2 dark:border-white/10 dark:bg-zinc-950/80">
                <p className="font-black uppercase tracking-widest text-ink/55 dark:text-white/55">100 daily</p>
                <p className="font-bold text-ink dark:text-white">~{formatExpected(proposal.metrics.xpEv * 100, 0)} XP</p>
                <p className="font-bold text-emerald-700 dark:text-emerald-300">~{formatExpected(proposal.metrics.crcEv * 100)} CRC</p>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white p-2 dark:border-white/10 dark:bg-zinc-950/80">
                <p className="font-black uppercase tracking-widest text-ink/55 dark:text-white/55">1 000 daily</p>
                <p className="font-bold text-ink dark:text-white">~{formatExpected(proposal.metrics.xpEv * 1000, 0)} XP</p>
                <p className="font-bold text-emerald-700 dark:text-emerald-300">~{formatExpected(proposal.metrics.crcEv * 1000)} CRC</p>
              </div>
            </div>
          </div>

          {proposal.optimizedSmallWins && (
            <p className="mt-3 rounded-lg bg-green-50 p-3 text-xs font-semibold text-green-800 dark:bg-green-500/10 dark:text-green-200">
              Petits gains +1 XP ajoutes dans cette proposition pour baisser le taux de "Rien" sans exploser le budget.
            </p>
          )}

          {proposal.blockers.length > 0 && (
            <div className="mt-3 space-y-2">
              {proposal.blockers.map((blocker, index) => (
                <p key={index} className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {blocker}
                </p>
              ))}
              <p className="text-xs font-semibold text-ink/75 dark:text-white/75">
                Pour debloquer: baisse le budget demande, augmente les montants des lots, ou ajoute des gains plus gros pour distribuer la meme valeur avec moins de probabilite.
              </p>
            </div>
          )}

          {proposal.warnings.length > 0 && (
            <div className="mt-3 space-y-2">
              {proposal.warnings.map((warning, index) => (
                <p key={index} className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs font-semibold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {warning}
                </p>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => onApplyProposal(tableKey)}
              disabled={!proposalCanApply}
              className="inline-flex items-center gap-2 rounded-lg bg-marine px-3 py-2 text-xs font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              <CheckCircle className="h-3.5 w-3.5" />
              Appliquer {title}
            </button>
            {proposalNeedsHigherNothingLimit && (
              <button
                onClick={() => onAcceptNothingLimit(tableKey)}
                disabled={!proposalCanApply}
                className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Check className="h-3.5 w-3.5" />
                Accepter {formatProbabilityPercent(proposal.metrics.nothingChance)}% et appliquer
              </button>
            )}
            {proposalNeedsHigherNothingLimit && !proposal.optimizedSmallWins && (
              <button
                onClick={() => onPreview(tableKey, true)}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:opacity-90"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Optimiser avec +1 XP
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function DailyRewardTable({
  title,
  tableKey,
  entries,
  draftVersion,
  saving,
  hasChanges,
  onAddEntry,
  onRemoveEntry,
  onUpdateEntry,
  onSave,
}: RewardTableProps) {
  const total = totalProb(entries);
  const isValid = Math.abs(total - 1.0) <= 0.01;

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xs font-bold text-ink/65 uppercase tracking-widest dark:text-white/70">{title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onAddEntry(tableKey, "xp")}
            className="inline-flex items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700 hover:bg-violet-200 dark:bg-violet-500/15 dark:text-violet-200 dark:hover:bg-violet-500/25"
          >
            <Sparkles className="h-3 w-3" />
            Ajouter XP
          </button>
          <button
            onClick={() => onAddEntry(tableKey, "crc")}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-200 dark:hover:bg-emerald-500/25"
          >
            <Gift className="h-3 w-3" />
            Ajouter CRC
          </button>
          <button
            onClick={() => onAddEntry(tableKey, "nothing")}
            className="rounded-lg bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-ink/65 hover:bg-ink/10 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15"
          >
            Ajouter vide
          </button>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isValid ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            Total: {(total * 100).toFixed(1)}%
          </span>
          {hasChanges && (
            <button
              onClick={() => onSave(tableKey)}
              disabled={saving === tableKey || !isValid}
              className="px-3 py-1 rounded-lg bg-marine text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
              title={!isValid ? "Le total des probabilites doit etre proche de 100%" : ""}
            >
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
            <input
              value={entry.label}
              onChange={e => onUpdateEntry(tableKey, i, "label", e.target.value)}
              className="flex-1 px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm font-semibold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            />
            <button
              onClick={() => onRemoveEntry(tableKey, i)}
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
              <input
                value={entry.type}
                onChange={e => onUpdateEntry(tableKey, i, "type", e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm font-mono text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-ink/60 font-bold dark:text-white/60">Prob %</label>
              <input
                type="text"
                inputMode="decimal"
                defaultValue={formatProbabilityPercent(entry.prob)}
                key={`prob-${tableKey}-${i}-${entries.length}-${draftVersion}`}
                onBlur={e => onUpdateEntry(tableKey, i, "prob", (parseFloat(e.target.value) || 0) / 100)}
                className="w-full px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-ink/60 font-bold dark:text-white/60">CRC</label>
              <input
                type="number"
                step="0.1"
                min={0}
                defaultValue={entry.crcValue}
                key={`crc-${tableKey}-${i}-${entries.length}-${draftVersion}`}
                onBlur={e => onUpdateEntry(tableKey, i, "crcValue", parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-ink/60 font-bold dark:text-white/60">XP</label>
              <input
                type="number"
                step="1"
                min={0}
                defaultValue={entry.xpValue}
                key={`xp-${tableKey}-${i}-${entries.length}-${draftVersion}`}
                onBlur={e => onUpdateEntry(tableKey, i, "xpValue", parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
              />
            </div>
            <div>
              <label className="text-[10px] text-ink/60 font-bold dark:text-white/60">{tableKey === "scratch" ? "Symbole" : "Couleur"}</label>
              <input
                value={entry.symbol || entry.color || ""}
                onChange={e => onUpdateEntry(tableKey, i, tableKey === "scratch" ? "symbol" : "color", e.target.value)}
                className="w-full px-2 py-1 rounded-lg border border-ink/10 bg-white text-sm text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-semibold text-ink/55 dark:text-white/55">
            <span>EV ligne: {(entry.prob * entry.xpValue).toFixed(2)} XP</span>
            <span>{formatExpected(entry.prob * entry.crcValue, 6)} CRC</span>
          </div>
        </div>
      ))}
    </section>
  );
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
  const [budgetDrafts, setBudgetDrafts] = useState<Record<DailyRewardTableKey, DailyBudgetDraft>>({
    scratch: emptyBudgetDraft(),
    spin: emptyBudgetDraft(),
  });
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetMessage, setBudgetMessage] = useState<string | null>(null);
  const [budgetProposals, setBudgetProposals] = useState<Record<DailyRewardTableKey, DailyBudgetTableProposal | null>>(emptyBudgetProposals);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/daily", { headers: { "x-admin-password": password } });
      const data = await res.json();
      setScratch(data.scratch || []);
      setSpin(data.spin || []);
      setEditScratch(data.scratch || []);
      setEditSpin(data.spin || []);
      setDraftVersion(v => v + 1);
      setBudgetProposals(emptyBudgetProposals());
    } catch {}
    setLoading(false);
  }, [password]);

  const [testAddress, setTestAddress] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => { fetchData(); }, [fetchData]);

  function clearBudgetOutcome(table?: DailyRewardTableKey) {
    setBudgetError(null);
    setBudgetMessage(null);
    setBudgetProposals(prev => table ? { ...prev, [table]: null } : emptyBudgetProposals());
  }

  function updateBudgetDraft(table: DailyRewardTableKey, field: keyof DailyBudgetDraft, value: string) {
    setBudgetDrafts(prev => ({
      ...prev,
      [table]: { ...prev[table], [field]: value },
    }));
    clearBudgetOutcome(table);
  }

  function updateDailyCount(value: string) {
    setBudgetDailyCount(value);
    clearBudgetOutcome();
  }

  function updateEntry(table: DailyRewardTableKey, index: number, field: string, value: unknown) {
    clearBudgetOutcome();
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

  function createEntry(table: DailyRewardTableKey, kind: "xp" | "crc" | "nothing"): DailyRewardEntry {
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

  function addEntry(table: DailyRewardTableKey, kind: "xp" | "crc" | "nothing") {
    clearBudgetOutcome();
    const setter = table === "scratch" ? setEditScratch : setEditSpin;
    setter(prev => [...prev, createEntry(table, kind)]);
  }

  function removeEntry(table: DailyRewardTableKey, index: number) {
    clearBudgetOutcome();
    const setter = table === "scratch" ? setEditScratch : setEditSpin;
    setter(prev => prev.filter((_, i) => i !== index));
  }

  async function saveTable(key: DailyRewardTableKey) {
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

  function hasChanges(key: DailyRewardTableKey) {
    const original = key === "scratch" ? scratch : spin;
    const edited = key === "scratch" ? editScratch : editSpin;
    return JSON.stringify(original) !== JSON.stringify(edited);
  }

  function rebalanceEntries(table: DailyRewardTableKey, entries: DailyRewardEntry[]) {
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

    const emptyProb = roundProb(1 - positiveTotal);
    balanced[emptyIdx] = { ...balanced[emptyIdx], prob: emptyProb };
    return { entries: balanced };
  }

  function createSmallXpEntry(table: DailyRewardTableKey): DailyRewardEntry {
    const entry = createEntry(table, "xp");
    return {
      ...entry,
      prob: 0,
      type: `xp_small_${entry.type.replace(/^xp_/, "")}`,
      label: "+1 XP",
      xpValue: 1,
      symbol: table === "scratch" ? "+" : entry.symbol,
      color: table === "spin" ? "#22C55E" : entry.color,
    };
  }

  function isSmallXpEntry(entry: DailyRewardEntry) {
    return entry.crcValue <= 0 && entry.xpValue === 1 && (
      entry.type.startsWith("xp_small_") ||
      entry.label.trim().toLowerCase() === "+1 xp"
    );
  }

  function fitNothingLimitWithSmallXp(table: DailyRewardTableKey, entries: DailyRewardEntry[], maxNothingProb: number | null) {
    if (maxNothingProb === null) return { entries, changed: false, remainingGap: 0 };

    const balanced = rebalanceEntries(table, entries);
    if (balanced.error) return { entries, changed: false, remainingGap: 0, error: balanced.error };

    const working = balanced.entries.map(entry => ({ ...entry }));
    const emptyIdx = working.findIndex(isEmptyReward);
    if (emptyIdx < 0) return { entries: working, changed: false, remainingGap: 0 };

    let remainingGap = working[emptyIdx].prob - maxNothingProb;
    if (remainingGap <= 0.000000001) return { entries: working, changed: false, remainingGap: 0 };

    let fillerIdx = working.findIndex(isSmallXpEntry);
    if (fillerIdx < 0) {
      working.push(createSmallXpEntry(table));
      fillerIdx = working.length - 1;
    }

    const donorIndexes = working
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry, index }) => index !== fillerIdx && entry.xpValue > 1 && entry.prob > 0)
      .sort((a, b) => b.entry.xpValue - a.entry.xpValue)
      .map(({ index }) => index);

    for (const donorIdx of donorIndexes) {
      if (remainingGap <= 0.000000001) break;

      const donor = working[donorIdx];
      const netProbPerXp = 1 - (1 / donor.xpValue);
      if (netProbPerXp <= 0) continue;

      const donorXpEv = donor.prob * donor.xpValue;
      const xpToMove = Math.min(donorXpEv, remainingGap / netProbPerXp);
      if (xpToMove <= 0) continue;

      working[donorIdx] = { ...donor, prob: roundProb(donor.prob - (xpToMove / donor.xpValue)) };
      working[fillerIdx] = { ...working[fillerIdx], prob: roundProb(working[fillerIdx].prob + xpToMove) };
      remainingGap -= xpToMove * netProbPerXp;
    }

    const finalBalance = rebalanceEntries(table, working);
    if (finalBalance.error) return { entries: working, changed: true, remainingGap, error: finalBalance.error };

    return {
      entries: finalBalance.entries,
      changed: true,
      remainingGap: Math.max(0, remainingGap),
    };
  }

  function previewBudgetCalculator(table: DailyRewardTableKey, optimizeSmallWins = false) {
    setBudgetError(null);
    setBudgetMessage(null);
    setBudgetProposals(prev => ({ ...prev, [table]: null }));

    const draft = budgetDrafts[table];
    const tableLabel = table === "scratch" ? "Scratch" : "Roue";
    const currentEntries = table === "scratch" ? editScratch : editSpin;
    const currentMetrics = getRewardMetrics(currentEntries);
    const hasCrcBudget = draft.crc.trim() !== "";
    const hasXpBudget = draft.xp.trim() !== "";
    const hasSpecialBudget = draft.specialChance.trim() !== "";
    const hasMaxNothingBudget = draft.maxNothingChance.trim() !== "";
    const dailyCount = Number(budgetDailyCount);
    const crcBudget = hasCrcBudget ? Number(draft.crc) : null;
    const xpBudget = hasXpBudget ? Number(draft.xp) : null;
    const specialChanceBudget = hasSpecialBudget ? Number(draft.specialChance) : null;
    const maxNothingBudget = hasMaxNothingBudget ? Number(draft.maxNothingChance) : null;

    if (!hasCrcBudget && !hasXpBudget && !hasSpecialBudget && !hasMaxNothingBudget) {
      setBudgetError(`Entre au moins un reglage pour ${tableLabel}: budget CRC, XP, bonus special ou max rien. Pour couper une famille, mets explicitement 0.`);
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
    if (hasSpecialBudget && (!Number.isFinite(specialChanceBudget) || specialChanceBudget! < 0 || specialChanceBudget! > 100)) {
      setBudgetError("La chance bonus special doit etre comprise entre 0% et 100%.");
      return;
    }
    if (hasMaxNothingBudget && (!Number.isFinite(maxNothingBudget) || maxNothingBudget! < 0 || maxNothingBudget! > 100)) {
      setBudgetError("Le max gagne rien doit etre compris entre 0% et 100%.");
      return;
    }

    const targetCrcEv = hasCrcBudget ? crcBudget! / dailyCount : currentMetrics.crcEv;
    const targetXpEv = hasXpBudget ? xpBudget! / dailyCount : currentMetrics.xpEv;
    const targetSpecialChance = hasSpecialBudget ? specialChanceBudget! / 100 : currentMetrics.specialChance;
    const maxNothingProb = hasMaxNothingBudget ? maxNothingBudget! / 100 : null;

    if (hasCrcBudget && targetCrcEv > 0 && currentMetrics.crcEv <= 0) {
      setBudgetError(`Ajoute au moins une ligne de gain CRC dans ${tableLabel} avant de calculer un budget CRC.`);
      return;
    }
    if (hasXpBudget && targetXpEv > 0 && currentMetrics.xpEv <= 0) {
      setBudgetError(`Ajoute au moins une ligne de gain XP dans ${tableLabel} avant de calculer un budget XP.`);
      return;
    }
    if (hasSpecialBudget && targetSpecialChance > 0 && currentMetrics.specialChance <= 0) {
      setBudgetError(`Ajoute au moins une ligne bonus special dans ${tableLabel}, par exemple streak_x2, avant de calculer cette chance.`);
      return;
    }

    const crcScale = hasCrcBudget ? (currentMetrics.crcEv > 0 ? targetCrcEv / currentMetrics.crcEv : 0) : 1;
    const xpScale = hasXpBudget ? (currentMetrics.xpEv > 0 ? targetXpEv / currentMetrics.xpEv : 0) : 1;
    const specialScale = hasSpecialBudget ? (currentMetrics.specialChance > 0 ? targetSpecialChance / currentMetrics.specialChance : 0) : 1;

    const scaleEntries = (entries: DailyRewardEntry[]) => entries.map(entry => {
      if (isEmptyReward(entry)) return { ...entry, prob: 0 };
      if (isSpecialReward(entry)) return { ...entry, prob: roundProb(entry.prob * specialScale) };

      const scales = [
        entry.crcValue > 0 && hasCrcBudget ? crcScale : null,
        entry.xpValue > 0 && hasXpBudget ? xpScale : null,
      ].filter((scale): scale is number => scale !== null);
      const factor = scales.length > 0 ? Math.min(...scales) : 1;
      return { ...entry, prob: roundProb(entry.prob * factor) };
    });

    const blockers: string[] = [];
    const warnings: string[] = [];

    let nextTable = rebalanceEntries(table, scaleEntries(currentEntries));
    if (nextTable.error) blockers.push(nextTable.error);

    if (blockers.length > 0) {
      setBudgetProposals(prev => ({
        ...prev,
        [table]: {
          table,
          entries: nextTable.entries,
          metrics: currentMetrics,
          optimizedSmallWins: optimizeSmallWins,
          warnings,
          blockers,
        },
      }));
      return;
    }

    let tableEntries = nextTable.entries;

    if (optimizeSmallWins && maxNothingProb !== null) {
      const fitted = fitNothingLimitWithSmallXp(table, tableEntries, maxNothingProb);

      tableEntries = fitted.entries;

      if (fitted.error) blockers.push(fitted.error);
      if (fitted.remainingGap > 0.000000001) {
        warnings.push("Les petits gains +1 XP ne suffisent pas a respecter totalement le max gagne rien avec cette structure de gains.");
      }
    }

    const nextMetrics = getRewardMetrics(tableEntries);

    if (maxNothingProb !== null && nextMetrics.nothingChance > maxNothingProb + 0.000000001) {
      warnings.push(`Cette proposition ${tableLabel} met ${formatProbabilityPercent(nextMetrics.nothingChance)}% sur "Rien", au-dessus de ta limite ${formatProbabilityPercent(maxNothingProb)}%.`);
    }

    setBudgetProposals(prev => ({
      ...prev,
      [table]: {
        table,
        entries: tableEntries,
        metrics: nextMetrics,
        optimizedSmallWins: optimizeSmallWins,
        warnings,
        blockers,
      },
    }));

    setBudgetMessage(`Proposition ${tableLabel} calculee. Regarde les chiffres, puis applique au brouillon si ca te va.`);
  }

  function applyBudgetProposal(table: DailyRewardTableKey) {
    const proposal = budgetProposals[table];
    if (!proposal || proposal.blockers.length > 0) return;

    if (table === "scratch") setEditScratch(proposal.entries);
    else setEditSpin(proposal.entries);
    setDraftVersion(v => v + 1);
    setBudgetProposals(prev => ({ ...prev, [table]: null }));
    setBudgetError(null);
    setBudgetMessage(`Proposition ${table === "scratch" ? "Scratch" : "Roue"} appliquee au brouillon. Sauvegarde la table pour publier.`);
  }

  function acceptProposalNothingLimitAndApply(table: DailyRewardTableKey) {
    const proposal = budgetProposals[table];
    if (!proposal) return;
    setBudgetDrafts(prev => ({
      ...prev,
      [table]: {
        ...prev[table],
        maxNothingChance: formatProbabilityPercent(proposal.metrics.nothingChance),
      },
    }));
    applyBudgetProposal(table);
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink/30" /></div>;

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
  const scratchMetrics = getRewardMetrics(editScratch);
  const spinMetrics = getRewardMetrics(editSpin);
  const scratchCrcEv = scratchMetrics.crcEv;
  const spinCrcEv = spinMetrics.crcEv;
  const scratchXpEv = scratchMetrics.xpEv;
  const spinXpEv = spinMetrics.xpEv;
  const combinedCrcEv = scratchCrcEv + spinCrcEv;
  const combinedXpEv = scratchXpEv + spinXpEv;
  const combinedSpecialChance = scratchMetrics.specialChance + spinMetrics.specialChance;
  const crcHitRate = 1 - (1 - scratchMetrics.crcChance) * (1 - spinMetrics.crcChance);
  const crcTone = combinedCrcEv > 0.05
    ? "text-red-700 bg-red-100 dark:text-red-200 dark:bg-red-500/20"
    : combinedCrcEv > 0.02
      ? "text-amber-700 bg-amber-100 dark:text-amber-200 dark:bg-amber-500/20"
      : "text-green-700 bg-green-100 dark:text-green-200 dark:bg-green-500/20";
  const dailyProjections = [
    { label: "100 daily joues", count: 100 },
    { label: "1 000 daily joues", count: 1000 },
  ];
  const budgetDailyNumber = Number(budgetDailyCount);
  const budgetProjectionCount = Number.isFinite(budgetDailyNumber) && budgetDailyNumber > 0 ? budgetDailyNumber : 100;

  function getBudgetPreview(table: DailyRewardTableKey, metrics: DailyRewardMetrics) {
    const draft = budgetDrafts[table];
    const hasCrcBudget = draft.crc.trim() !== "";
    const hasXpBudget = draft.xp.trim() !== "";
    const hasSpecialBudget = draft.specialChance.trim() !== "";
    const hasMaxNothingBudget = draft.maxNothingChance.trim() !== "";
    const crcBudget = hasCrcBudget ? Number(draft.crc) : 0;
    const xpBudget = hasXpBudget ? Number(draft.xp) : 0;
    const specialBudget = hasSpecialBudget ? Number(draft.specialChance) : 0;
    const maxNothingBudget = hasMaxNothingBudget ? Number(draft.maxNothingChance) : 0;
    const hasInput = hasCrcBudget || hasXpBudget || hasSpecialBudget || hasMaxNothingBudget;
    const valid =
      hasInput &&
      Number.isFinite(budgetDailyNumber) && budgetDailyNumber > 0 &&
      (!hasCrcBudget || (Number.isFinite(crcBudget) && crcBudget >= 0)) &&
      (!hasXpBudget || (Number.isFinite(xpBudget) && xpBudget >= 0)) &&
      (!hasSpecialBudget || (Number.isFinite(specialBudget) && specialBudget >= 0 && specialBudget <= 100)) &&
      (!hasMaxNothingBudget || (Number.isFinite(maxNothingBudget) && maxNothingBudget >= 0 && maxNothingBudget <= 100));

    return {
      draft,
      hasCrcBudget,
      hasXpBudget,
      hasSpecialBudget,
      hasMaxNothingBudget,
      valid,
      targetCrcEv: valid && hasCrcBudget ? crcBudget / budgetDailyNumber : metrics.crcEv,
      targetXpEv: valid && hasXpBudget ? xpBudget / budgetDailyNumber : metrics.xpEv,
      targetSpecialChance: valid && hasSpecialBudget ? specialBudget : metrics.specialChance * 100,
      targetMaxNothingChance: valid && hasMaxNothingBudget ? maxNothingBudget : metrics.nothingChance * 100,
    };
  }

  const scratchBudgetPreview = getBudgetPreview("scratch", scratchMetrics);
  const spinBudgetPreview = getBudgetPreview("spin", spinMetrics);

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
          <span>Bonus speciaux: {formatProbabilityPercent(combinedSpecialChance)}%</span>
          <span>Rien: scratch {formatProbabilityPercent(scratchMetrics.nothingChance)}% / roue {formatProbabilityPercent(spinMetrics.nothingChance)}%</span>
          <span>Formule: gain moyen = gain configure x probabilite</span>
        </div>
        {combinedCrcEv > 0.05 && <p className="text-xs text-red-700 font-semibold dark:text-red-300">Attention: gain CRC moyen eleve pour un daily gratuit.</p>}
        {combinedCrcEv <= 0.05 && <p className="text-xs text-green-700 font-semibold dark:text-green-300">Les CRC restent rares; l'XP porte la recompense principale.</p>}
      </div>

      <div className="rounded-xl border border-marine/15 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Calculator className="h-4 w-4 text-marine dark:text-cyan-300" />
              <h3 className="text-sm font-black uppercase tracking-widest text-ink dark:text-white">Calculateur de budget daily</h3>
            </div>
            <p className="mt-1 text-sm text-ink/70 dark:text-white/70">
              Scratch et roue se reglent separement. Le nombre de daily reste commun, car un daily complet lance les deux.
            </p>
            <p className="mt-1 text-xs font-semibold text-ink/55 dark:text-white/55">
              Dans chaque bloc, laisse un champ vide pour ne pas toucher a cette famille, ou mets 0 pour la couper.
            </p>
          </div>
          <div className="w-full max-w-xs">
            <label className="text-[10px] font-black uppercase tracking-widest text-ink/60 dark:text-white/60">Daily estimes / jour</label>
            <input
              type="number"
              min={1}
              step={1}
              value={budgetDailyCount}
              onChange={e => updateDailyCount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm font-bold text-ink dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 2xl:grid-cols-2">
          <DailyBudgetPanel
            tableKey="scratch"
            title="Scratch"
            metrics={scratchMetrics}
            preview={scratchBudgetPreview}
            proposal={budgetProposals.scratch}
            budgetProjectionCount={budgetProjectionCount}
            onPreview={previewBudgetCalculator}
            onUpdateDraft={updateBudgetDraft}
            onApplyProposal={applyBudgetProposal}
            onAcceptNothingLimit={acceptProposalNothingLimitAndApply}
          />
          <DailyBudgetPanel
            tableKey="spin"
            title="Roue"
            metrics={spinMetrics}
            preview={spinBudgetPreview}
            proposal={budgetProposals.spin}
            budgetProjectionCount={budgetProjectionCount}
            onPreview={previewBudgetCalculator}
            onUpdateDraft={updateBudgetDraft}
            onApplyProposal={applyBudgetProposal}
            onAcceptNothingLimit={acceptProposalNothingLimitAndApply}
          />
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

      <DailyRewardTable
        title="Scratch Card — Tableau de gains"
        tableKey="scratch"
        entries={editScratch}
        draftVersion={draftVersion}
        saving={saving}
        hasChanges={hasChanges("scratch")}
        onAddEntry={addEntry}
        onRemoveEntry={removeEntry}
        onUpdateEntry={updateEntry}
        onSave={saveTable}
      />
      <DailyRewardTable
        title="Roue — Segments"
        tableKey="spin"
        entries={editSpin}
        draftVersion={draftVersion}
        saving={saving}
        hasChanges={hasChanges("spin")}
        onAddEntry={addEntry}
        onRemoveEntry={removeEntry}
        onUpdateEntry={updateEntry}
        onSave={saveTable}
      />

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
