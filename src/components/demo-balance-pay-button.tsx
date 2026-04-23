"use client";

import { Wallet } from "lucide-react";
import { useDemo } from "@/components/demo-provider";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

interface DemoBalancePayButtonProps {
  amountCrc: number;
  accentColor: string;
  onPaid: () => void;
}

export function DemoBalancePayButton({
  amountCrc,
  accentColor,
  onPaid,
}: DemoBalancePayButtonProps) {
  const { demoPlayer, debitDemoBalance } = useDemo();
  const { locale } = useLocale();
  const t = translations.quickReplay;

  const canPay = demoPlayer.balanceCrc >= amountCrc;

  function handlePay() {
    if (!canPay) return;
    const ok = debitDemoBalance(amountCrc);
    if (ok) onPaid();
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10 p-4 space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
          <Wallet className="h-3.5 w-3.5" />
          {t.demoBalance[locale]}
        </div>
        <span className="text-emerald-700 dark:text-emerald-400 tabular-nums font-medium">
          {demoPlayer.balanceCrc.toFixed(2)} CRC
        </span>
      </div>
      <button
        onClick={handlePay}
        disabled={!canPay}
        className="w-full h-11 rounded-xl font-bold text-white transition-all disabled:opacity-40 hover:opacity-90"
        style={{ backgroundColor: accentColor }}
      >
        🧪 {t.demoPay[locale].replace("{amount}", String(amountCrc))}
      </button>
      {!canPay && (
        <p className="text-xs text-red-500 text-center font-semibold">
          {t.demoInsufficient[locale]}
        </p>
      )}
    </div>
  );
}
