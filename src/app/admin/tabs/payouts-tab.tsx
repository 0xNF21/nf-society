"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Loader2, Eye, EyeOff, Clock,
  Flag, Gift, Sparkles, Trash2, RefreshCw, Send,
  ChevronDown, ExternalLink, AlertCircle, CheckCircle, XCircle,
  Palette, Check, Archive, Wallet,
} from "lucide-react";
import Link from "next/link";
import type { FlagRow, FlagStatus } from "../types";
import { CATEGORY_COLORS, CATEGORY_LABELS, STATUS_CONFIG, STATUS_ORDER, PAYOUT_STATUS_COLORS } from "../constants";

/* ═══════════════════════════════════════════════════
   PAYOUTS TAB
   ═══════════════════════════════════════════════════ */
export function PayoutsTab({ password }: { password: string }) {
  const [payoutStatus, setPayoutStatus] = useState<any>(null);
  const [payoutList, setPayoutList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<number | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualForm, setManualForm] = useState({ gameType: "reward", recipientAddress: "", amountCrc: "", reason: "" });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [manualResult, setManualResult] = useState<any>(null);
  const [monitorRunning, setMonitorRunning] = useState(false);
  const [monitorResult, setMonitorResult] = useState<any>(null);
  const [balances, setBalances] = useState<{ address: string; balanceCrc: number; lastSeen: string }[]>([]);
  const [balancesTotal, setBalancesTotal] = useState(0);
  const [balancesLoading, setBalancesLoading] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, { name?: string; imageUrl?: string | null }>>({});
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundScanning, setRefundScanning] = useState(false);
  const [refundExecuting, setRefundExecuting] = useState(false);
  const [refundResult, setRefundResult] = useState<any>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setBalancesLoading(true);
    try {
      const [sRes, lRes, bRes] = await Promise.all([
        fetch("/api/payout/status", { cache: "no-store" }),
        fetch("/api/payout?limit=20", { cache: "no-store", headers: { Authorization: `Bearer ${password}` } }),
        fetch("/api/admin/balances", { cache: "no-store", headers: { "x-admin-password": password } }),
      ]);
      if (sRes.ok) setPayoutStatus(await sRes.json());
      if (lRes.ok) { const d = await lRes.json(); setPayoutList(d.payouts || []); }
      if (bRes.ok) {
        const d = await bRes.json();
        const list = d.players || [];
        setBalances(list);
        setBalancesTotal(d.totalCrc || 0);
        if (list.length > 0) {
          try {
            const pRes = await fetch("/api/profiles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ addresses: list.map((p: any) => p.address) }),
            });
            if (pRes.ok) {
              const pd = await pRes.json();
              setProfiles(pd.profiles || {});
            }
          } catch {}
        }
      }
    } catch {} finally { setLoading(false); setBalancesLoading(false); }
  }, [password]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRetry = async (id: number) => {
    setRetrying(id);
    try {
      await fetch("/api/payout/retry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payoutId: id, password }) });
      await fetchData();
    } catch {} finally { setRetrying(null); }
  };

  const handleRunMonitor = async () => {
    setMonitorRunning(true);
    setMonitorResult(null);
    try {
      const res = await fetch("/api/cron/payouts-monitor", { cache: "no-store" });
      const data = await res.json();
      setMonitorResult(data);
      await fetchData();
    } catch (e: any) {
      setMonitorResult({ ok: false, error: e.message });
    } finally {
      setMonitorRunning(false);
    }
  };

  const counts = payoutList.reduce<Record<string, number>>((acc, po) => {
    const key = po.status === "failed" && po.attempts >= 3 ? "max_retries" : po.status;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const handleRefundScan = async (execute: boolean) => {
    if (execute) setRefundExecuting(true); else setRefundScanning(true);
    setRefundResult(null);
    try {
      const res = await fetch(`/api/admin/refund-overpayments${execute ? "?execute=true" : ""}`, {
        method: "POST",
        headers: { "x-admin-password": password },
      });
      const data = await res.json();
      setRefundResult(data);
      if (execute) fetchData();
    } catch (e: any) {
      setRefundResult({ error: e.message });
    } finally {
      setRefundScanning(false);
      setRefundExecuting(false);
    }
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

      {/* Refund overpayments */}
      {payoutStatus?.configured && (
        <div className="rounded-2xl border-2 border-ink/10 bg-white/80 p-4">
          <button onClick={() => setRefundOpen(!refundOpen)} className="w-full flex items-center justify-between text-sm font-semibold text-ink">
            <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4 text-amber-600" /> Rembourser overpayments multijoueur</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${refundOpen ? "rotate-180" : ""}`} />
          </button>
          {refundOpen && (
            <div className="mt-4 space-y-3">
              <p className="text-xs text-ink/60">
                Scan les paiements historiques jamais assignes a player1/player2 (3e joueur arrive apres slot plein, double-pay, etc.). Lance d&apos;abord un dry-run pour voir la liste, puis execute.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleRefundScan(false)}
                  disabled={refundScanning || refundExecuting}
                  className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {refundScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  Dry-run
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!confirm(`Rembourser ${refundResult?.count || 0} paiement(s) pour un total de ${refundResult?.totalCrc || 0} CRC ?`)) return;
                    handleRefundScan(true);
                  }}
                  disabled={refundExecuting || refundScanning || !refundResult?.count || refundResult?.dryRun === false}
                  className="flex-1 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {refundExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Executer
                </button>
              </div>
              {refundResult && !refundResult.error && (
                <div className="rounded-lg bg-ink/5 p-3 text-sm space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {refundResult.dryRun ? "Dry-run" : "Resultat"} : {refundResult.count} orphan(s)
                    </span>
                    <span className="text-ink/60">{refundResult.totalCrc} CRC total</span>
                  </div>
                  {refundResult.orphans?.length > 0 && (
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {refundResult.orphans.map((o: any) => (
                        <div key={o.txHash} className="text-xs bg-white rounded px-2 py-1.5 flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold">{o.gameKey}</span>
                              <span className="text-ink/40">#{o.gameSlug}</span>
                              {o.refundStatus && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                  o.refundStatus === "sending" || o.refundStatus === "success" ? "bg-green-100 text-green-700"
                                  : o.refundStatus === "already_paid" || o.refundStatus === "already_sending" ? "bg-blue-100 text-blue-700"
                                  : "bg-red-100 text-red-700"
                                }`}>{o.refundStatus}</span>
                              )}
                            </div>
                            <a href={`https://gnosisscan.io/tx/${o.txHash}`} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] text-ink/50 hover:text-marine inline-flex items-center gap-0.5">
                              {o.txHash.slice(0, 10)}...{o.txHash.slice(-6)} <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                            {o.refundError && <p className="text-[10px] text-red-500 truncate">{o.refundError}</p>}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-semibold">{o.amountCrc} CRC</p>
                            <p className="font-mono text-[10px] text-ink/40">{shortAddr(o.playerAddress)}</p>
                            {o.claimedAt && <p className="text-[10px] text-ink/40">{new Date(o.claimedAt).toLocaleDateString()}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {refundResult?.error && (
                <div className="text-sm p-2 rounded-lg bg-red-50 text-red-700">{refundResult.error}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Stats par statut + cron monitor */}
      {payoutStatus?.configured && (
        <div className="rounded-2xl border-2 border-ink/10 bg-white/80 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink">Statut des paiements (20 derniers)</h3>
            <button
              onClick={handleRunMonitor}
              disabled={monitorRunning}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1"
              title="Lance manuellement le cron monitor (verifie les sending + retry les failed)"
            >
              {monitorRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Lancer le monitor
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            <div className="rounded-lg bg-green-50 p-2 text-center">
              <div className="text-2xl font-bold text-green-700">{counts.success || 0}</div>
              <div className="text-green-600">Confirmes</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-2 text-center">
              <div className="text-2xl font-bold text-blue-700">{counts.sending || 0}</div>
              <div className="text-blue-600">En cours</div>
            </div>
            <div className="rounded-lg bg-yellow-50 p-2 text-center">
              <div className="text-2xl font-bold text-yellow-700">{counts.pending || 0}</div>
              <div className="text-yellow-600">En attente</div>
            </div>
            <div className="rounded-lg bg-red-50 p-2 text-center">
              <div className="text-2xl font-bold text-red-700">{counts.failed || 0}</div>
              <div className="text-red-600">En echec</div>
            </div>
            <div className="rounded-lg bg-red-100 p-2 text-center">
              <div className="text-2xl font-bold text-red-800">{counts.max_retries || 0}</div>
              <div className="text-red-700">Max atteint</div>
            </div>
          </div>
          {monitorResult && (
            <div className={`text-xs p-2 rounded-lg ${monitorResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {monitorResult.ok ? (
                <>
                  Monitor OK — {monitorResult.sendingChecked} verif. ({monitorResult.confirmed} confirmees, {monitorResult.stillPending} en attente, {monitorResult.confirmedFailed} echec on-chain)
                  {monitorResult.failedRetried > 0 && <> | {monitorResult.failedRetried} retry ({monitorResult.retrySucceeded} OK, {monitorResult.retryFailed} KO)</>}
                  {monitorResult.maxAttemptsReached > 0 && <> | {monitorResult.maxAttemptsReached} max-retry atteint</>}
                </>
              ) : (
                <>Erreur : {monitorResult.error}</>
              )}
            </div>
          )}
        </div>
      )}

      {/* Balances actives (lecture seule) */}
      <div className="rounded-2xl border-2 border-ink/10 bg-white/80 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Balances actives
            {!balancesLoading && (
              <span className="text-xs font-normal text-ink/40">
                ({balances.length} joueur{balances.length > 1 ? "s" : ""} · {balancesTotal.toFixed(2)} CRC)
              </span>
            )}
          </h3>
          <button onClick={fetchData} className="text-ink/40 hover:text-ink/60" title="Rafraichir">
            <RefreshCw className={`h-4 w-4 ${balancesLoading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {balancesLoading ? (
          <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mx-auto text-ink/30" /></div>
        ) : balances.length === 0 ? (
          <p className="text-sm text-ink/40 text-center py-4">Aucun joueur avec solde actif</p>
        ) : (
          <div className="space-y-1.5 max-h-96 overflow-y-auto">
            {balances.map((p) => {
              const prof = profiles[p.address.toLowerCase()];
              const name = prof?.name;
              return (
                <div key={p.address} className="flex items-center justify-between gap-3 bg-ink/5 rounded-lg px-3 py-2 text-sm">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {prof?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={prof.imageUrl} alt="" className="h-7 w-7 rounded-full shrink-0 object-cover" />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-marine/10 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      {name && <p className="font-semibold text-ink truncate">{name}</p>}
                      <a
                        href={`https://gnosisscan.io/address/${p.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-ink/50 hover:text-marine inline-flex items-center gap-0.5"
                      >
                        {shortAddr(p.address)} <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-ink">{p.balanceCrc.toFixed(2)} CRC</p>
                    <p className="text-xs text-ink/40">
                      {new Date(p.lastSeen).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${PAYOUT_STATUS_COLORS[po.status] || "bg-gray-100 text-gray-600"}`}>
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
