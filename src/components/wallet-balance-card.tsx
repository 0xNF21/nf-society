"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet, Plus, Loader2, ArrowDownCircle } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { TopupModal } from "@/components/topup-modal";
import { CashoutModal } from "@/components/cashout-modal";
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

  const balance = isDemo ? demoPlayer.balanceCrc : realBalance;

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
          onClose={() => setCashoutOpen(false)}
          onCashedOut={handleCashoutSuccess}
        />
      )}
    </>
  );
}
