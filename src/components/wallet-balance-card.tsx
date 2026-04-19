"use client";

import { useState, useEffect, useCallback } from "react";
import { Wallet, Plus, Loader2 } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { TopupModal } from "@/components/topup-modal";

interface WalletBalanceCardProps {
  address: string;
}

/**
 * Compact card that shows the player's prepaid CRC balance and opens
 * the topup modal. Meant to be rendered inside ProfileModal.
 */
export function WalletBalanceCard({ address }: WalletBalanceCardProps) {
  const { locale } = useLocale();
  const t = translations.wallet;
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [topupOpen, setTopupOpen] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`/api/wallet/balance?address=${encodeURIComponent(address)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (typeof data.balanceCrc === "number") setBalance(data.balanceCrc);
    } catch {
      // Silent — leave balance as last known
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  function handleTopupSuccess(newBalance: number) {
    setBalance(newBalance);
    // Keep the modal open so the user sees the confirmation, they close
    // it manually when they're ready.
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

        <button
          onClick={() => setTopupOpen(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-marine text-white text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" />
          {t.topupBtn[locale]}
        </button>
      </div>

      {topupOpen && (
        <TopupModal
          address={address}
          onClose={() => setTopupOpen(false)}
          onCredited={handleTopupSuccess}
        />
      )}
    </>
  );
}
