"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";

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

function RewardLine({ title, play }: { title: string; play?: DailyPlayResult }) {
  const result = play?.result;

  return (
    <p className="font-bold text-ink dark:text-white">
      {title} : {result?.label || "Aucun resultat"}
      {Number(result?.crcValue || 0) > 0 && (
        <span className="text-emerald-600"> - {result?.crcValue} CRC envoye</span>
      )}
      {Number(result?.xpValue || 0) > 0 && (
        <span className="text-violet-600"> - +{result?.xpValue} XP</span>
      )}
      {play?.payout?.error && (
        <span className="text-red-500"> (payout erreur: {play.payout.error})</span>
      )}
    </p>
  );
}

export function DailyTab({ password }: { password: string }) {
  const [testAddress, setTestAddress] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<DailyTestResult | null>(null);

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
        <p className="text-xs font-black uppercase tracking-widest text-ink/50 dark:text-white/50">Daily rewards</p>
        <h3 className="mt-2 text-lg font-black text-ink dark:text-white">Configuration a reconstruire</h3>
        <p className="mt-1 max-w-3xl text-sm font-semibold text-ink/65 dark:text-white/65">
          Le daily est maintenant recentre sur une seule roue XP/CRC. Le designer et les anciens tableaux ont ete retires.
        </p>
        <div className="mt-4 rounded-lg border border-dashed border-ink/15 bg-ink/[0.02] p-3 text-xs font-semibold text-ink/55 dark:border-white/15 dark:bg-white/[0.03] dark:text-white/55">
          La configuration editable sera reconstruite proprement sur cette base roue uniquement.
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
            onChange={e => setTestAddress(e.target.value)}
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
