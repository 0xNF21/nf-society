"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

interface QuickReplayModalProps {
  open: boolean;
  onClose: () => void;
  betOptions: number[];
  currentBet: number;
  onBetChange: (bet: number) => void;
  accentColor: string;
  /** Payment flow — typically a pre-configured <ChancePayment> rendered by the parent. */
  children: React.ReactNode;
}

export function QuickReplayModal({
  open,
  onClose,
  betOptions,
  currentBet,
  onBetChange,
  accentColor,
  children,
}: QuickReplayModalProps) {
  const { locale } = useLocale();
  const t = translations.quickReplay;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white dark:bg-ink/95 rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink">{t.title[locale]}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-ink/5 hover:bg-ink/10 flex items-center justify-center text-ink/60"
            aria-label={t.close[locale]}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {betOptions.length > 1 && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-ink/60 uppercase tracking-widest">{t.bet[locale]}</p>
            <div className="grid grid-cols-4 gap-2">
              {betOptions.map((bet) => (
                <button
                  key={bet}
                  onClick={() => onBetChange(bet)}
                  className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                    currentBet === bet
                      ? "text-white shadow-md scale-105"
                      : "bg-ink/5 dark:bg-white/5 text-ink/60 hover:bg-ink/10"
                  }`}
                  style={currentBet === bet ? { backgroundColor: accentColor } : {}}
                >
                  {bet} CRC
                </button>
              ))}
            </div>
          </div>
        )}

        <div>{children}</div>
      </div>
    </div>
  );
}
