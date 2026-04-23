"use client";

import { useEffect, useState } from "react";
import { X, ArrowLeft, Settings2 } from "lucide-react";
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
  /** Inline config panel shown when the user clicks "Modifier la config". */
  configPanel?: React.ReactNode;
  /** Callback called when the user clicks "Modifier la config" and no inline panel is provided.
   *  Typically closes the modal and resets the game so the full bet/config selection becomes visible. */
  onChangeConfig?: () => void;
}

export function QuickReplayModal({
  open,
  onClose,
  betOptions,
  currentBet,
  onBetChange,
  accentColor,
  children,
  configPanel,
  onChangeConfig,
}: QuickReplayModalProps) {
  const { locale } = useLocale();
  const t = translations.quickReplay;

  const [view, setView] = useState<"pay" | "config">("pay");

  useEffect(() => {
    if (!open) setView("pay");
  }, [open]);

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

  const showConfigButton = !!configPanel || !!onChangeConfig;

  const handleConfigClick = () => {
    if (configPanel) {
      setView("config");
    } else if (onChangeConfig) {
      onChangeConfig();
    }
  };

  const isConfigView = view === "config" && !!configPanel;

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
          <div className="flex items-center gap-2">
            {isConfigView && (
              <button
                onClick={() => setView("pay")}
                className="w-8 h-8 rounded-full bg-ink/5 hover:bg-ink/10 flex items-center justify-center text-ink/60"
                aria-label={t.back[locale]}
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h3 className="text-lg font-bold text-ink">
              {isConfigView ? t.changeConfig[locale] : t.title[locale]}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-ink/5 hover:bg-ink/10 flex items-center justify-center text-ink/60"
            aria-label={t.close[locale]}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isConfigView ? (
          <>
            {configPanel}
            <button
              onClick={() => setView("pay")}
              className="w-full py-3 rounded-xl font-bold text-sm text-white hover:opacity-90"
              style={{ backgroundColor: accentColor }}
            >
              {t.validate[locale]}
            </button>
          </>
        ) : (
          <>
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

            {showConfigButton && (
              <button
                onClick={handleConfigClick}
                className="w-full py-2.5 rounded-xl text-sm font-medium border border-ink/15 text-ink/70 hover:bg-ink/5 flex items-center justify-center gap-2"
              >
                <Settings2 className="w-4 h-4" />
                {t.changeConfig[locale]}
              </button>
            )}

            <div>{children}</div>
          </>
        )}
      </div>
    </div>
  );
}
