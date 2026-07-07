"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, BarChart3, Camera, CalendarClock, CheckCircle, Loader2, RefreshCw, Save, Trophy } from "lucide-react";

type SeasonStatus = "draft" | "scheduled" | "active" | "review" | "finalized";
type GameKey = "memory" | "dames";

type GameForm = {
  key: GameKey;
  label: string;
  enabled: boolean;
  maxMatches: string;
  maxMatchesPerOpponent: string;
  minMatches: string;
  minOpponents: string;
};

type ArcadeNightState = {
  tableReady: boolean;
  config: {
    title: string;
    status: SeasonStatus;
    publicStatus: string;
    startAt: string | null;
    durationMinutes: number;
    poolCrc: number;
    betaParticipants: string[];
    games: Array<{
      key: GameKey;
      label: string;
      enabled: boolean;
      maxMatches: number;
      maxMatchesPerOpponent: number;
      minMatches: number;
      minOpponents: number;
    }>;
    note: string;
  };
  updatedAt: string | null;
};

type ScoringSnapshot = {
  generatedAt: string;
  status: "ready" | "missing_window" | "tables_unavailable";
  scoringRule: "created_and_finished_within_window";
  window: {
    startAt: string | null;
    endAt: string | null;
    durationMinutes: number;
  };
  warnings: string[];
  summary: {
    totalScannedMatches: number;
    totalValidMatches: number;
    totalCountedRows: number;
    eligiblePlayers: number;
  };
  games: Array<{
    gameKey: GameKey;
    label: string;
    scannedMatches: number;
    validMatches: number;
    countedRows: number;
    rules: {
      maxMatches: number;
      maxMatchesPerOpponent: number;
      minMatches: number;
      minOpponents: number;
    };
    leaderboard: Array<{
      rank: number;
      address: string;
      points: number;
      wins: number;
      draws: number;
      losses: number;
      matches: number;
      rawMatches: number;
      uniqueOpponents: number;
      winRate: number;
      eligibleForRewards: boolean;
      eligibilityReasons: string[];
    }>;
  }>;
  projectedRewards: Array<{
    key: string;
    label: string;
    gameKey: GameKey | "helper";
    amountCrc: number;
    address: string | null;
    sourceRank: number | null;
    status: "projected" | "manual" | "unassigned";
  }>;
};

type FormState = {
  title: string;
  status: SeasonStatus;
  publicStatus: string;
  startAtLocal: string;
  durationMinutes: string;
  poolCrc: string;
  betaParticipantsText: string;
  note: string;
  games: GameForm[];
};

const STATUS_OPTIONS: Array<{ value: SeasonStatus; label: string }> = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Planifie" },
  { value: "active", label: "Actif" },
  { value: "review", label: "Review" },
  { value: "finalized", label: "Finalise" },
];

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toApiDate(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

function formFromState(state: ArcadeNightState): FormState {
  return {
    title: state.config.title,
    status: state.config.status,
    publicStatus: state.config.publicStatus,
    startAtLocal: toLocalInput(state.config.startAt),
    durationMinutes: String(state.config.durationMinutes),
    poolCrc: formatNumber(state.config.poolCrc),
    betaParticipantsText: state.config.betaParticipants.join("\n"),
    note: state.config.note,
    games: state.config.games.map((game) => ({
      key: game.key,
      label: game.label,
      enabled: game.enabled,
      maxMatches: String(game.maxMatches),
      maxMatchesPerOpponent: String(game.maxMatchesPerOpponent),
      minMatches: String(game.minMatches),
      minOpponents: String(game.minOpponents),
    })),
  };
}

function defaultForm(): FormState {
  return {
    title: "NF Arcade Night #1",
    status: "draft",
    publicStatus: "Beta fermee bientot",
    startAtLocal: "",
    durationMinutes: "90",
    poolCrc: "5000",
    betaParticipantsText: "",
    note: "Beta fermee avec quelques membres NF Society pour tester Memory, Dames, le leaderboard et la review.",
    games: [
      { key: "memory", label: "Memory", enabled: true, maxMatches: "6", maxMatchesPerOpponent: "3", minMatches: "3", minOpponents: "2" },
      { key: "dames", label: "Dames", enabled: true, maxMatches: "3", maxMatchesPerOpponent: "2", minMatches: "2", minOpponents: "2" },
    ],
  };
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function parsePositiveNumber(value: string, fallback: number): number {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : fallback;
}

function rewardSplit(poolCrc: number) {
  const rounded = (ratio: number) => Math.round(poolCrc * ratio * 100) / 100;
  return [
    { label: "Memory #1", amount: rounded(0.3) },
    { label: "Memory #2", amount: rounded(0.15) },
    { label: "Dames #1", amount: rounded(0.3) },
    { label: "Dames #2", amount: rounded(0.15) },
    { label: "Beta helper / bug report", amount: rounded(0.1) },
  ];
}

export function ArcadeNightTab({ password }: { password: string }) {
  const [form, setForm] = useState<FormState>(defaultForm);
  const [tableReady, setTableReady] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const poolCrc = useMemo(() => parsePositiveNumber(form.poolCrc, 0), [form.poolCrc]);
  const participants = useMemo(() => (
    form.betaParticipantsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  ), [form.betaParticipantsText]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    fetch("/api/admin/arcade-night", {
      headers: { "x-admin-password": password },
      cache: "no-store",
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.message || data?.error || "Erreur chargement");
        return data;
      })
      .then((data) => {
        if (!active) return;
        if (data?.state) {
          setForm(formFromState(data.state));
          setTableReady(Boolean(data.state.tableReady));
          setUpdatedAt(data.state.updatedAt ?? null);
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Erreur chargement");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [password]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setOk(false);
    setError(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateGame(key: GameKey, patch: Partial<GameForm>) {
    setOk(false);
    setError(null);
    setForm((current) => ({
      ...current,
      games: current.games.map((game) => game.key === key ? { ...game, ...patch } : game),
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setOk(false);

    const payload = {
      title: form.title,
      status: form.status,
      publicStatus: form.publicStatus,
      startAt: toApiDate(form.startAtLocal),
      durationMinutes: parsePositiveInt(form.durationMinutes, 90),
      poolCrc,
      betaParticipants: participants,
      note: form.note,
      games: form.games.map((game) => ({
        key: game.key,
        enabled: game.enabled,
        maxMatches: parsePositiveInt(game.maxMatches, game.key === "memory" ? 6 : 3),
        maxMatchesPerOpponent: parsePositiveInt(game.maxMatchesPerOpponent, game.key === "memory" ? 3 : 2),
        minMatches: parsePositiveInt(game.minMatches, game.key === "memory" ? 3 : 2),
        minOpponents: parsePositiveInt(game.minOpponents, 2),
      })),
    };

    try {
      const res = await fetch("/api/admin/arcade-night", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": password,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "Erreur sauvegarde");
      setForm(formFromState(data.state));
      setTableReady(Boolean(data.state.tableReady));
      setUpdatedAt(data.state.updatedAt ?? null);
      setOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur sauvegarde");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-2xl border border-ink/10 bg-white p-10 dark:border-white/10 dark:bg-white/5">
        <Loader2 className="h-5 w-5 animate-spin text-marine" />
      </div>
    );
  }

  return (
    <section className="space-y-4">
      {!tableReady && (
        <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>Les tables Season ne sont pas encore migrees. La page publique utilise les valeurs par defaut, et la sauvegarde sera bloquee.</p>
        </div>
      )}

      {error && (
        <div className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {ok && (
        <div className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <p>Configuration sauvegardee.</p>
        </div>
      )}

      <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-black text-ink dark:text-white">
              <CalendarClock className="h-5 w-5 text-marine" />
              Arcade Night
            </h2>
            <p className="mt-1 text-sm font-semibold text-ink/55 dark:text-white/55">
              Pilote la page publique /arcade-night. Pas de scoring automatique dans cette PR.
            </p>
          </div>
          {updatedAt && (
            <p className="text-xs font-bold text-ink/40 dark:text-white/40">
              Maj {new Date(updatedAt).toLocaleString("fr-FR")}
            </p>
          )}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Titre event">
            <input value={form.title} onChange={(e) => updateField("title", e.target.value)}
              className="admin-input" />
          </Field>
          <Field label="Badge public">
            <input value={form.publicStatus} onChange={(e) => updateField("publicStatus", e.target.value)}
              className="admin-input" />
          </Field>
          <Field label="Status interne">
            <select value={form.status} onChange={(e) => updateField("status", e.target.value as SeasonStatus)}
              className="admin-input">
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Date / heure">
            <input type="datetime-local" value={form.startAtLocal}
              onChange={(e) => updateField("startAtLocal", e.target.value)}
              className="admin-input" />
          </Field>
          <Field label="Duree (minutes)">
            <input type="number" min={30} max={240} value={form.durationMinutes}
              onChange={(e) => updateField("durationMinutes", e.target.value)}
              className="admin-input" />
          </Field>
          <Field label="Pool total (CRC)">
            <input type="number" min={0} step="0.01" value={form.poolCrc}
              onChange={(e) => updateField("poolCrc", e.target.value)}
              className="admin-input" />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Note publique courte">
            <textarea value={form.note} rows={3}
              onChange={(e) => updateField("note", e.target.value)}
              className="admin-input resize-none" />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          <h3 className="text-lg font-black text-ink dark:text-white">Jeux et regles</h3>
          <div className="mt-4 grid gap-4">
            {form.games.map((game) => (
              <div key={game.key} className="rounded-xl border border-ink/10 p-4 dark:border-white/10">
                <label className="flex items-center gap-3 text-sm font-black text-ink dark:text-white">
                  <input type="checkbox" checked={game.enabled}
                    onChange={(e) => updateGame(game.key, { enabled: e.target.checked })}
                    className="h-4 w-4 accent-marine" />
                  {game.label}
                </label>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Matchs comptes max">
                    <input type="number" min={1} value={game.maxMatches}
                      onChange={(e) => updateGame(game.key, { maxMatches: e.target.value })}
                      className="admin-input" />
                  </Field>
                  <Field label="Max contre meme wallet">
                    <input type="number" min={1} value={game.maxMatchesPerOpponent}
                      onChange={(e) => updateGame(game.key, { maxMatchesPerOpponent: e.target.value })}
                      className="admin-input" />
                  </Field>
                  <Field label="Matchs valides minimum">
                    <input type="number" min={1} value={game.minMatches}
                      onChange={(e) => updateGame(game.key, { minMatches: e.target.value })}
                      className="admin-input" />
                  </Field>
                  <Field label="Adversaires minimum">
                    <input type="number" min={1} value={game.minOpponents}
                      onChange={(e) => updateGame(game.key, { minOpponents: e.target.value })}
                      className="admin-input" />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
          <h3 className="text-lg font-black text-ink dark:text-white">Participants beta</h3>
          <p className="mt-1 text-xs font-semibold text-ink/45 dark:text-white/45">
            Une ligne par wallet, pseudo ou membre. Liste ops uniquement pour cette beta.
          </p>
          <textarea value={form.betaParticipantsText} rows={9}
            onChange={(e) => updateField("betaParticipantsText", e.target.value)}
            placeholder="0x...&#10;cryptosnf&#10;membre Discord..."
            className="admin-input mt-4 resize-none font-mono text-xs" />
          <p className="mt-2 text-xs font-bold text-ink/40 dark:text-white/40">
            {participants.length} participant{participants.length > 1 ? "s" : ""} renseigne{participants.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
        <h3 className="flex items-center gap-2 text-lg font-black text-ink dark:text-white">
          <Trophy className="h-5 w-5 text-citrus" />
          Repartition automatique
        </h3>
        <p className="mt-1 text-sm font-semibold text-ink/55 dark:text-white/55">
          Le pool est reparti en 30% / 15% par jeu, puis 10% pour le helper beta.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {rewardSplit(poolCrc).map((reward) => (
            <div key={reward.label} className="rounded-xl border border-ink/10 bg-ink/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
              <p className="text-xs font-black text-ink dark:text-white">{reward.label}</p>
              <p className="mt-1 text-sm font-black text-marine dark:text-blue-300">{formatNumber(reward.amount)} CRC</p>
            </div>
          ))}
        </div>
      </div>

      <ArcadeNightScoringPanel password={password} />

      <button type="button" onClick={save} disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-marine px-4 py-3 text-sm font-black text-white transition-colors hover:bg-marine/90 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Sauvegarder Arcade Night
      </button>
    </section>
  );
}

function ArcadeNightScoringPanel({ password }: { password: string }) {
  const [snapshot, setSnapshot] = useState<ScoringSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function loadSnapshot() {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/arcade-night/scoring", {
        headers: { "x-admin-password": password },
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "Erreur scoring");
      setSnapshot(data.snapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur scoring");
    } finally {
      setLoading(false);
    }
  }

  async function saveSnapshot() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/arcade-night/scoring", {
        method: "POST",
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || data?.error || "Erreur snapshot");
      setSnapshot(data.snapshot);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur snapshot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-black text-ink dark:text-white">
            <BarChart3 className="h-5 w-5 text-marine" />
            Scoring dry-run
          </h3>
          <p className="mt-1 text-sm font-semibold text-ink/55 dark:text-white/55">
            Calcule les leaderboards Memory/Dames sans payout. Regle stricte: partie creee et terminee dans la fenetre.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={loadSnapshot} disabled={loading || saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-ink/10 px-3 py-2 text-xs font-black text-ink transition-colors hover:bg-ink/5 disabled:opacity-50 dark:border-white/10 dark:text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Calculer
          </button>
          <button type="button" onClick={saveSnapshot} disabled={loading || saving || snapshot?.status !== "ready"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-3 py-2 text-xs font-black text-white transition-colors hover:bg-ink/90 disabled:opacity-50 dark:bg-white dark:text-ink">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Sauver snapshot
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {saved && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">
          <CheckCircle className="h-5 w-5 shrink-0" />
          <p>Snapshot sauvegarde dans la config Season pour audit.</p>
        </div>
      )}

      {!snapshot && (
        <div className="mt-4 rounded-2xl border border-dashed border-ink/15 p-4 text-sm font-semibold text-ink/45 dark:border-white/15 dark:text-white/45">
          Lance un calcul quand tu veux verifier les scores provisoires.
        </div>
      )}

      {snapshot && (
        <div className="mt-5 space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <ScoringStat label="Status" value={snapshot.status} />
            <ScoringStat label="Matchs valides" value={String(snapshot.summary.totalValidMatches)} />
            <ScoringStat label="Lignes comptees" value={String(snapshot.summary.totalCountedRows)} />
            <ScoringStat label="Eligibles" value={String(snapshot.summary.eligiblePlayers)} />
          </div>

          {snapshot.warnings.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
              <p className="font-black">Warnings</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {snapshot.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {snapshot.games.map((game) => (
              <div key={game.gameKey} className="rounded-2xl border border-ink/10 p-4 dark:border-white/10">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-black text-ink dark:text-white">{game.label}</h4>
                    <p className="mt-1 text-xs font-semibold text-ink/45 dark:text-white/45">
                      {game.validMatches} match(s) valides · caps {game.rules.maxMatches}/{game.rules.maxMatchesPerOpponent}
                    </p>
                  </div>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-xs">
                    <thead className="text-ink/40 dark:text-white/40">
                      <tr>
                        <th className="py-2 pr-2">#</th>
                        <th className="py-2 pr-2">Wallet</th>
                        <th className="py-2 pr-2">Pts</th>
                        <th className="py-2 pr-2">W/D/L</th>
                        <th className="py-2 pr-2">Matchs</th>
                        <th className="py-2 pr-2">Opp.</th>
                        <th className="py-2 pr-2">Reward</th>
                      </tr>
                    </thead>
                    <tbody>
                      {game.leaderboard.slice(0, 8).map((entry) => (
                        <tr key={entry.address} className="border-t border-ink/5 font-semibold dark:border-white/5">
                          <td className="py-2 pr-2 font-black">{entry.rank}</td>
                          <td className="py-2 pr-2 font-mono">{shortAddress(entry.address)}</td>
                          <td className="py-2 pr-2 font-black">{entry.points}</td>
                          <td className="py-2 pr-2">{entry.wins}/{entry.draws}/{entry.losses}</td>
                          <td className="py-2 pr-2">{entry.matches}/{entry.rawMatches}</td>
                          <td className="py-2 pr-2">{entry.uniqueOpponents}</td>
                          <td className="py-2 pr-2">
                            {entry.eligibleForRewards ? (
                              <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">OK</span>
                            ) : (
                              <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black text-amber-700">
                                {entry.eligibilityReasons.join(", ")}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {game.leaderboard.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-4 text-center font-semibold text-ink/40 dark:text-white/40">
                            Aucun score pour le moment.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-ink/10 p-4 dark:border-white/10">
            <h4 className="text-sm font-black text-ink dark:text-white">Rewards projetees</h4>
            <div className="mt-3 grid gap-2 sm:grid-cols-5">
              {snapshot.projectedRewards.map((reward) => (
                <div key={reward.key} className="rounded-xl bg-ink/[0.02] p-3 dark:bg-white/[0.03]">
                  <p className="text-xs font-black text-ink dark:text-white">{reward.label}</p>
                  <p className="mt-1 text-xs font-semibold text-ink/45 dark:text-white/45">{formatNumber(reward.amountCrc)} CRC</p>
                  <p className="mt-2 break-all font-mono text-[10px] font-bold text-marine dark:text-blue-300">
                    {reward.address ? shortAddress(reward.address) : reward.status === "manual" ? "manuel" : "non assigne"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoringStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink/10 bg-ink/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03]">
      <p className="text-[10px] font-black uppercase tracking-widest text-ink/40 dark:text-white/40">{label}</p>
      <p className="mt-1 text-lg font-black text-ink dark:text-white">{value}</p>
    </div>
  );
}

function shortAddress(address: string): string {
  return address.length > 14 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-black uppercase tracking-widest text-ink/40 dark:text-white/40">
        {label}
      </span>
      {children}
    </label>
  );
}
