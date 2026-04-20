"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet, Plus, Loader2, ArrowDownCircle, Clock, X as XIcon } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { TopupModal } from "@/components/topup-modal";
import { CashoutModal, cashoutPendingKey, type PendingCashoutStored } from "@/components/cashout-modal";
import { LedgerHistory } from "@/components/ledger-history";

interface WalletBalanceCardProps {
  address: string;
}

/**
 * Compact card that shows the player's prepaid CRC balance and opens
 * the topup modal. Meant to be rendered inside ProfileModal.
 *
 * Demo mode reads balance from the DemoProvider (localStorage-backed),
 * never hits /api/wallet/*. The topup modal handles the demo crediting
 * itself via useDemo().creditDemoBalance.
 */
export function WalletBalanceCard({ address }: WalletBalanceCardProps) {
  const { locale } = useLocale();
  const { isDemo, demoPlayer } = useDemo();
  const t = translations.wallet;
  const [realBalance, setRealBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(!isDemo);
  const [topupOpen, setTopupOpen] = useState(false);
  const [cashoutOpen, setCashoutOpen] = useState(false);
  const [resumedToken, setResumedToken] = useState<string | undefined>(undefined);
  const [pendingCashout, setPendingCashout] = useState<PendingCashoutStored | null>(null);

  const balance = isDemo ? demoPlayer.balanceCrc : realBalance;

  // Surface a pending cashout if one was started earlier and the user left
  // without finishing. Demo mode has no persisted sessions — skip.
  const refreshPending = useCallback(() => {
    if (isDemo || !address) {
      setPendingCashout(null);
      return;
    }
    try {
      const raw = localStorage.getItem(cashoutPendingKey(address));
      if (!raw) {
        setPendingCashout(null);
        return;
      }
      const parsed = JSON.parse(raw) as PendingCashoutStored;
      // Expired marker — drop silently.
      if (!parsed?.expiresAt || Date.now() > new Date(parsed.expiresAt).getTime()) {
        localStorage.removeItem(cashoutPendingKey(address));
        setPendingCashout(null);
        return;
      }
      setPendingCashout(parsed);
    } catch {
      setPendingCashout(null);
    }
  }, [address, isDemo]);

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  const fetchBalance = useCallback(async () => {
    if (isDemo || !address) return;
    try {
      const res = await fetch(`/api/wallet/balance?address=${encodeURIComponent(address)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (typeof data.balanceCrc === "number") setRealBalance(data.balanceCrc);
    } catch {
      // Silent — leave balance as last known
    } finally {
      setLoading(false);
    }
  }, [address, isDemo]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  function handleTopupSuccess(newBalance: number) {
    if (!isDemo) setRealBalance(newBalance);
    // Demo balance updates via context automatically — no-op here.
  }

  function handleCashoutSuccess(newBalance: number) {
    if (!isDemo) setRealBalance(newBalance);
  }

  function handleCashoutClose() {
    setCashoutOpen(false);
    setResumedToken(undefined);
    // Modal may have cleared the localStorage marker (terminal state) or
    // left it in place (user closed mid-flow). Either way, re-read so the
    // banner reflects the latest truth.
    refreshPending();
  }

  function handleResumeCashout() {
    if (!pendingCashout) return;
    setResumedToken(pendingCashout.token);
    setCashoutOpen(true);
  }

  function handleIgnorePending() {
    if (!address) return;
    try {
      localStorage.removeItem(cashoutPendingKey(address));
    } catch { /* silent */ }
    setPendingCashout(null);
  }

  return (
    <>
      <div className="rounded-xl bg-gradient-to-br from-marine/[0.05] to-citrus/[0.05] border border-ink/5 p-3 space-y-2">
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5 text-xs text-ink/40 font-bold uppercase tracking-widest">
            <Wallet className="h-3.5 w-3.5" />
            {t.title[locale]}
          </span>
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink/30" />}
        </div>

        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-black text-marine tabular-nums">
            {balance !== null ? balance.toFixed(2) : "—"}
          </span>
          <span className="text-sm font-bold text-ink/60">CRC</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setTopupOpen(true)}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-marine text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <Plus className="h-3.5 w-3.5" />
            {t.topupBtn[locale]}
          </button>
          <button
            onClick={() => setCashoutOpen(true)}
            disabled={!balance || balance < 1}
            className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white text-marine border border-marine/30 text-sm font-semibold hover:bg-marine/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowDownCircle className="h-3.5 w-3.5" />
            {t.cashoutBtn[locale]}
          </button>
        </div>
      </div>

      {pendingCashout && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-amber-900">
              {t.pendingCashoutTitle[locale].replace("%AMOUNT%", pendingCashout.amountCrc.toFixed(2).replace(/\.00$/, ""))}
            </p>
            <p className="text-[11px] text-amber-700/80">
              {t.pendingCashoutHint[locale]}
            </p>
          </div>
          <button
            onClick={handleResumeCashout}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 transition-colors"
          >
            {t.pendingCashoutResume[locale]}
          </button>
          <button
            onClick={handleIgnorePending}
            title={t.pendingCashoutIgnore[locale]}
            aria-label={t.pendingCashoutIgnore[locale]}
            className="shrink-0 text-amber-700/60 hover:text-amber-900 p-1"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <LedgerHistory address={address} />

      {topupOpen && (
        <TopupModal
          address={address}
          onClose={() => setTopupOpen(false)}
          onCredited={handleTopupSuccess}
        />
      )}

      {cashoutOpen && balance !== null && (
        <CashoutModal
          address={address}
          currentBalance={balance}
          onClose={handleCashoutClose}
          onCashedOut={handleCashoutSuccess}
          resumedToken={resumedToken}
        />
      )}
    </>
  );
}
