"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle, Loader2, Plus, Save, Trash2 } from "lucide-react";

type RewardKind = "xp" | "crc";

type DailyRewardResult = {
  label?: string;
  crcValue?: number;
  xpValue?: number;
};

type DailyPlayResult = {
  result?: DailyRewardResult;
  payout?: {
    error?: string;
  };
};

type DailyTestResult = {
  error?: string;
  wheel?: DailyPlayResult;
};

type ApiReward = {
  prob: number;
  type: string;
  label: string;
  crcValue: number;
  xpValue: number;
  color?: string;
};

type RewardRow = {
  id: string;
  kind: RewardKind;
  label: string;
  probability: string;
  xpValue: string;
  crcValue: string;
  color: string;
};

const DEFAULT_ROWS: RewardRow[] = [
  { id: "xp-75", kind: "xp", label: "+75 XP", probability: "45", xpValue: "75", crcValue: "0", color: "#10B981" },
  { id: "xp-200", kind: "xp", label: "+200 XP", probability: "35", xpValue: "200", crcValue: "0", color: "#38BDF8" },
  { id: "xp-500", kind: "xp", label: "+500 XP", probability: "17", xpValue: "500", crcValue: "0", color: "#8B5CF6" },
  { id: "crc-1", kind: "crc", label: "+1 CRC", probability: "2.8", xpValue: "0", crcValue: "1", color: "#F59E0B" },
  { id: "crc-10", kind: "crc", label: "+10 CRC", probability: "0.2", xpValue: "0", crcValue: "10", color: "#EC4899" },
];

function parseNumber(value: string): number {
  const normalized = value.replace(",", ".").trim();
  if (normalized === "") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

function kindFromReward(reward: ApiReward): RewardKind | null {
  if (Number(reward.crcValue) > 0) return "crc";
  if (Number(reward.xpValue) > 0) return "xp";
  return null;
}

function rowFromReward(reward: ApiReward, index: number): RewardRow | null {
  const kind = kindFromReward(reward);
  if (!kind) return null;
  return {
    id: `${kind}-${reward.type || index}-${index}`,
    kind,
    label: reward.label || "",
    probability: formatNumber(Number(reward.prob || 0) * 100),
    xpValue: formatNumber(Number(reward.xpValue || 0)),
    crcValue: formatNumber(Number(reward.crcValue || 0)),
    color: reward.color || (kind === "crc" ? "#F59E0B" : "#10B981"),
  };
}

function sanitizeTypePart(value: number): string {
  return formatNumber(value).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "0";
}

function typeForRow(row: RewardRow, index: number): string {
  const xp = Math.floor(parseNumber(row.xpValue));
  const crc = parseNumber(row.crcValue);
  if (row.kind === "xp") return `xp_${sanitizeTypePart(xp)}_${index + 1}`;
  return `crc_${sanitizeTypePart(crc)}_${index + 1}`;
}

function labelForRow(row: RewardRow): string {
  const label = row.label.trim();
  if (label) return label;
  if (row.kind === "xp") return `+${Math.floor(parseNumber(row.xpValue))} XP`;
  return `+${formatNumber(parseNumber(row.crcValue))} CRC`;
}

function buildPayload(rows: RewardRow[]): ApiReward[] {
  return rows.map((row, index) => {
    const xpValue = row.kind === "xp" ? Math.floor(parseNumber(row.xpValue)) : 0;
    const crcValue = row.kind === "crc" ? parseNumber(row.crcValue) : 0;
    return {
      prob: Math.max(0, parseNumber(row.probability)) / 100,
      type: typeForRow(row, index),
      label: labelForRow(row),
      crcValue,
      xpValue,
      color: row.color || "#6B7280",
    };
  });
}

function RewardLine({ title, play }: { title: string; play?: DailyPlayResult }) {
  const result = play?.result;

  return (
    <p className="font-bold text-ink dark:text-white">
      {title} : {result?.label || "Aucun resultat"}
      {Number(result?.crcValue || 0) > 0 && (
        <span className="text-emerald-600"> - {result?.crcValue} CRC envoye</span>
      )}
      {Number(result?.xpValue || 0) > 0 && (
        <span className="text-violet-600"> - +{result?.xpValue} XP de solde</span>
      )}
      {play?.payout?.error && (
        <span className="text-red-500"> (payout erreur: {play.payout.error})</span>
      )}
    </p>
  );
}

function StatBox({ label, value, accent = "text-ink dark:text-white" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-ink/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-[10px] font-black uppercase tracking-widest text-ink/45 dark:text-white/45">{label}</p>
      <p className={`mt-1 text-lg font-black ${accent}`}>{value}</p>
    </div>
  );
}

export function DailyTab({ password }: { password: string }) {
  const [rows, setRows] = useState<RewardRow[]>(DEFAULT_ROWS);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [testAddress, setTestAddress] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<DailyTestResult | null>(null);

  const summary = useMemo(() => {
    const totalProbability = rows.reduce((sum, row) => sum + Math.max(0, parseNumber(row.probability)), 0);
    const expectedXp = rows.reduce((sum, row) => (
      sum + (Math.max(0, parseNumber(row.probability)) / 100) * (row.kind === "xp" ? Math.floor(parseNumber(row.xpValue)) : 0)
    ), 0);
    const expectedCrc = rows.reduce((sum, row) => (
      sum + (Math.max(0, parseNumber(row.probability)) / 100) * (row.kind === "crc" ? parseNumber(row.crcValue) : 0)
    ), 0);
    const crcChance = rows
      .filter((row) => row.kind === "crc")
      .reduce((sum, row) => sum + Math.max(0, parseNumber(row.probability)), 0);

    return {
      totalProbability,
      expectedXp,
      expectedCrc,
      crcChance,
    };
  }, [rows]);

  const totalValid = Math.abs(summary.totalProbability - 100) <= 0.01;
  const canSave = totalValid && !saving && rows.length > 0;

  useEffect(() => {
    let active = true;
    setLoadingConfig(true);
    fetch("/api/admin/daily", {
      headers: { "x-admin-password": password },
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        if (Array.isArray(data?.wheel) && data.wheel.length > 0) {
          const loadedRows = data.wheel
            .map(rowFromReward)
            .filter((row: RewardRow | null): row is RewardRow => row !== null);
          setRows(loadedRows.length > 0 ? loadedRows : DEFAULT_ROWS);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoadingConfig(false);
      });
    return () => { active = false; };
  }, [password]);

  function updateRow(id: string, patch: Partial<RewardRow>) {
    setSaveOk(false);
    setSaveError(null);
    setRows((current) => current.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, ...patch };
      if (patch.kind === "xp") return { ...next, crcValue: "0" };
      if (patch.kind === "crc") return { ...next, xpValue: "0" };
      return next;
    }));
  }

  function addRow(kind: RewardKind) {
    const id = `${kind}-${Date.now()}`;
    setRows((current) => [
      ...current,
      {
        id,
        kind,
        label: kind === "xp" ? "+100 XP" : "+1 CRC",
        probability: "1",
        xpValue: kind === "xp" ? "100" : "0",
        crcValue: kind === "crc" ? "1" : "0",
        color: kind === "crc" ? "#F59E0B" : "#10B981",
      },
    ]);
  }

  function removeRow(id: string) {
    setSaveOk(false);
    setSaveError(null);
    setRows((current) => current.filter((row) => row.id !== id));
  }

  async function saveConfig() {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);

    try {
      const res = await fetch("/api/admin/daily", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify({ key: "wheel", rewards: buildPayload(rows) }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSaveError(data?.error || "Sauvegarde impossible");
        return;
      }
      if (Array.isArray(data.wheel)) {
        const savedRows = data.wheel
          .map(rowFromReward)
          .filter((row: RewardRow | null): row is RewardRow => row !== null);
        setRows(savedRows.length > 0 ? savedRows : DEFAULT_ROWS);
      }
      setSaveOk(true);
    } catch {
      setSaveError("Sauvegarde impossible");
    } finally {
      setSaving(false);
    }
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
    } catch {
      setTestResult({ error: "Request failed" });
    }

    setTesting(false);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-ink/10 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-zinc-950">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-ink/50 dark:text-white/50">Daily rewards</p>
            <h3 className="mt-2 text-lg font-black text-ink dark:text-white">Roue daily solde XP / CRC</h3>
            <p className="mt-1 max-w-3xl text-sm font-semibold text-ink/65 dark:text-white/65">
              Configure les gains de la roue quotidienne. Chaque tirage donne soit du solde XP jouable, soit un gain CRC rare.
            </p>
          </div>
          <button
            onClick={saveConfig}
            disabled={!canSave}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-black text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Sauvegarder
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatBox
            label="Total probas"
            value={`${formatNumber(summary.totalProbability)}%`}
            accent={totalValid ? "text-emerald-600" : "text-red-500"}
          />
          <StatBox label="Solde XP moyen / daily" value={formatNumber(summary.expectedXp)} accent="text-violet-600" />
          <StatBox label="CRC moyen / daily" value={formatNumber(summary.expectedCrc)} accent="text-emerald-600" />
          <StatBox label="Chance CRC" value={`${formatNumber(summary.crcChance)}%`} accent="text-amber-600" />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <StatBox label="100 daily" value={`${formatNumber(summary.expectedXp * 100)} XP / ${formatNumber(summary.expectedCrc * 100)} CRC`} />
          <StatBox label="1000 daily" value={`${formatNumber(summary.expectedXp * 1000)} XP / ${formatNumber(summary.expectedCrc * 1000)} CRC`} />
          <StatBox label="30 jours a 100 daily" value={`${formatNumber(summary.expectedCrc * 3000)} CRC`} />
        </div>

        {!totalValid && (
          <div className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-600 dark:text-red-300">
            Le total est a {formatNumber(summary.totalProbability)}%. Ajuste les probabilites pour atteindre 100%.
          </div>
        )}
        {saveError && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm font-bold text-red-600 dark:text-red-300">
            <AlertCircle className="h-4 w-4" />
            {saveError}
          </div>
        )}
        {saveOk && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle className="h-4 w-4" />
            Configuration sauvegardee.
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => addRow("xp")} className="inline-flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm font-bold text-ink hover:bg-ink/5 dark:border-white/10 dark:text-white dark:hover:bg-white/5">
            <Plus className="h-4 w-4" />
            Gain solde XP
          </button>
          <button onClick={() => addRow("crc")} className="inline-flex items-center gap-2 rounded-lg border border-ink/10 px-3 py-2 text-sm font-bold text-ink hover:bg-ink/5 dark:border-white/10 dark:text-white dark:hover:bg-white/5">
            <Plus className="h-4 w-4" />
            Gain CRC
          </button>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-ink/10 dark:border-white/10">
          <table className="min-w-[920px] w-full border-collapse text-sm">
            <thead className="bg-ink/[0.03] text-left text-[10px] font-black uppercase tracking-widest text-ink/50 dark:bg-white/[0.04] dark:text-white/50">
              <tr>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Label</th>
                <th className="px-3 py-3">Proba %</th>
                <th className="px-3 py-3">Solde XP</th>
                <th className="px-3 py-3">CRC</th>
                <th className="px-3 py-3">Couleur</th>
                <th className="px-3 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loadingConfig ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm font-bold text-ink/50 dark:text-white/50">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Chargement...
                  </td>
                </tr>
              ) : rows.map((row) => (
                <tr key={row.id} className="border-t border-ink/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    <select
                      value={row.kind}
                      onChange={(event) => updateRow(row.id, { kind: event.target.value as RewardKind })}
                      className="w-full rounded-lg border border-ink/10 bg-white px-2 py-2 font-bold text-ink dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                    >
                      <option value="xp">XP</option>
                      <option value="crc">CRC</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.label}
                      onChange={(event) => updateRow(row.id, { label: event.target.value })}
                      className="w-full rounded-lg border border-ink/10 bg-white px-2 py-2 font-semibold text-ink dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="decimal"
                      value={row.probability}
                      onChange={(event) => updateRow(row.id, { probability: event.target.value })}
                      className="w-full rounded-lg border border-ink/10 bg-white px-2 py-2 font-mono font-bold text-ink dark:border-white/10 dark:bg-zinc-950 dark:text-white"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="numeric"
                      disabled={row.kind !== "xp"}
                      value={row.xpValue}
                      onChange={(event) => updateRow(row.id, { xpValue: event.target.value })}
                      className="w-full rounded-lg border border-ink/10 bg-white px-2 py-2 font-mono font-bold text-ink disabled:bg-ink/[0.04] disabled:text-ink/35 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:disabled:bg-white/[0.04] dark:disabled:text-white/35"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      inputMode="decimal"
                      disabled={row.kind !== "crc"}
                      value={row.crcValue}
                      onChange={(event) => updateRow(row.id, { crcValue: event.target.value })}
                      className="w-full rounded-lg border border-ink/10 bg-white px-2 py-2 font-mono font-bold text-ink disabled:bg-ink/[0.04] disabled:text-ink/35 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:disabled:bg-white/[0.04] dark:disabled:text-white/35"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="color"
                      value={row.color}
                      onChange={(event) => updateRow(row.id, { color: event.target.value })}
                      className="h-10 w-14 rounded-lg border border-ink/10 bg-white p-1 dark:border-white/10 dark:bg-zinc-950"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length <= 1}
                      className="inline-flex items-center justify-center rounded-lg p-2 text-red-500 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                      aria-label="Supprimer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border-2 border-dashed border-amber-300/50 bg-amber-50/30 p-4 dark:bg-amber-900/10">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-700 dark:text-amber-400">
          Test Daily
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            placeholder="Adresse 0x..."
            value={testAddress}
            onChange={(event) => setTestAddress(event.target.value)}
            className="flex-1 rounded-lg border border-ink/10 px-3 py-2 font-mono text-sm text-ink dark:border-white/10 dark:bg-zinc-950 dark:text-white"
          />
          <button
            onClick={runTest}
            disabled={testing || !testAddress}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testing && <Loader2 className="h-4 w-4 animate-spin" />}
            {testing ? "Test..." : "Lancer"}
          </button>
        </div>

        {testResult && (
          <div className="space-y-2 rounded-xl border border-ink/10 bg-white/90 p-3 text-sm shadow-sm dark:border-white/10 dark:bg-zinc-950/70">
            {testResult.error ? (
              <p className="flex items-center gap-2 font-bold text-red-500">
                <AlertCircle className="h-4 w-4" />
                {testResult.error}
              </p>
            ) : (
              <>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-green-700 dark:text-green-300">
                  <CheckCircle className="h-4 w-4" />
                  Resultat du test
                </p>
                <RewardLine title="Roue" play={testResult.wheel} />
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
