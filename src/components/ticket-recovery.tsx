"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, CheckCircle2, XCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { useMiniApp } from "@/components/miniapp-provider";

type Step = "idle" | "init" | "waiting" | "searching" | "found" | "no-ticket" | "expired" | "error";

interface TicketRecoveryProps {
  gameKey: string;
  slug: string;
  /** localStorage key used by usePlayerToken (defaults to `${gameKey}-${slug}-token`) */
  storageKey?: string;
}

export function TicketRecovery({ gameKey, slug, storageKey }: TicketRecoveryProps) {
  const { locale } = useLocale();
  const t = translations.ticketRecovery;
  const tm = translations.miniapp;
  const { isMiniApp, sendPayment } = useMiniApp();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<Step>("idle");
  const [authToken, setAuthToken] = useState("");
  const [paymentLink, setPaymentLink] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [miniAppPaying, setMiniAppPaying] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  function close() {
    setIsOpen(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setTimeout(() => {
      setStep("idle");
      setAuthToken("");
      setPaymentLink("");
      setQrCode("");
    }, 300);
  }

  async function openAndInit() {
    setIsOpen(true);
    setStep("init");
    try {
      const res = await fetch("/api/nf-auth", { method: "POST" });
      const data = await res.json();
      if (!data.token) {
        setStep("error");
        return;
      }
      setAuthToken(data.token);
      setPaymentLink(data.paymentLink);
      setQrCode(data.qrCode);
      setRecipientAddress(data.recipientAddress || "");
      setStep("waiting");
    } catch {
      setStep("error");
    }
  }

  // Poll /api/nf-auth while waiting for confirmation
  useEffect(() => {
    if (step !== "waiting" || !authToken) return;

    let stopped = false;

    async function tick() {
      if (stopped) return;
      try {
        const res = await fetch(`/api/nf-auth?token=${authToken}`);
        const data = await res.json();
        if (stopped) return;
        if (data.status === "confirmed" && data.address) {
          setStep("searching");
          await fetchTicket(authToken);
        } else if (data.status === "expired") {
          setStep("expired");
        }
      } catch {}
    }

    pollRef.current = setInterval(tick, 3000);
    tick();

    return () => {
      stopped = true;
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [step, authToken]);

  async function fetchTicket(token: string) {
    try {
      const res = await fetch(
        `/api/game-ticket?gameKey=${encodeURIComponent(gameKey)}&slug=${encodeURIComponent(slug)}&authToken=${encodeURIComponent(token)}`,
      );
      const data = await res.json();
      if (data.status === "confirmed" && data.token) {
        const key = storageKey || `${gameKey}-${slug}-token`;
        try { localStorage.setItem(key, data.token); } catch {}
        setStep("found");
        setTimeout(() => { window.location.reload(); }, 1000);
      } else {
        setStep("no-ticket");
      }
    } catch {
      setStep("error");
    }
  }

  async function handleMiniAppPay() {
    if (!authToken || !recipientAddress) return;
    setMiniAppPaying(true);
    try {
      const data = `nf_auth:${authToken}`;
      await sendPayment(recipientAddress, 1, data);
    } catch {
      // Polling will still catch the payment if it went through
    } finally {
      setMiniAppPaying(false);
    }
  }

  return (
    <>
      <button
        onClick={openAndInit}
        className="w-full text-xs text-ink/40 hover:text-ink/60 flex items-center justify-center gap-1.5 transition-colors"
        type="button"
      >
        <Search className="w-3 h-3" />
        {t.button[locale]}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={close}>
          <div
            className="bg-white dark:bg-ink rounded-2xl shadow-2xl max-w-md w-full p-6 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              className="absolute top-4 right-4 text-ink/40 hover:text-ink/70 transition-colors"
              type="button"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-lg font-bold text-ink dark:text-white mb-1">{t.title[locale]}</h2>
            <p className="text-sm text-ink/60 dark:text-white/60 mb-5">{t.description[locale]}</p>

            {step === "init" && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-ink/40" />
              </div>
            )}

            {step === "waiting" && (
              <div className="space-y-4">
                {isMiniApp ? (
                  <Button
                    className="w-full rounded-xl font-bold"
                    onClick={handleMiniAppPay}
                    disabled={miniAppPaying}
                  >
                    {miniAppPaying ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" />{tm.paying[locale]}</>
                    ) : (
                      t.payBtn[locale]
                    )}
                  </Button>
                ) : (
                  <>
                    <a href={paymentLink} target="_blank" rel="noreferrer">
                      <Button className="w-full rounded-xl font-bold">{t.payBtn[locale]}</Button>
                    </a>
                    {qrCode && (
                      <div className="flex flex-col items-center gap-2">
                        <div className="bg-white rounded-2xl p-3 shadow border border-ink/5">
                          <img src={qrCode} alt="QR Code" className="w-[200px] h-[200px]" />
                        </div>
                        <p className="text-xs text-ink/50 text-center">{t.scanQr[locale]}</p>
                      </div>
                    )}
                  </>
                )}
                <div className="flex items-center gap-2 justify-center text-xs text-ink/50">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t.waiting[locale]}
                </div>
              </div>
            )}

            {step === "searching" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                <p className="text-sm font-semibold text-emerald-600">{t.confirmed[locale]}</p>
                <div className="flex items-center gap-2 text-xs text-ink/50">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {t.searching[locale]}
                </div>
              </div>
            )}

            {step === "found" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <p className="text-base font-bold text-emerald-600">{t.found[locale]}</p>
              </div>
            )}

            {step === "no-ticket" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <XCircle className="w-8 h-8 text-ink/30" />
                <p className="text-sm text-center text-ink/60 dark:text-white/60">{t.noTicket[locale]}</p>
                <Button variant="outline" size="sm" onClick={close} className="rounded-xl">
                  {t.close[locale]}
                </Button>
              </div>
            )}

            {step === "expired" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <XCircle className="w-8 h-8 text-amber-500" />
                <p className="text-sm text-center text-ink/60 dark:text-white/60">{t.expired[locale]}</p>
                <Button size="sm" onClick={openAndInit} className="rounded-xl">
                  {t.retry[locale]}
                </Button>
              </div>
            )}

            {step === "error" && (
              <div className="flex flex-col items-center gap-3 py-6">
                <XCircle className="w-8 h-8 text-red-500" />
                <p className="text-sm text-center text-red-600">{t.error[locale]}</p>
                <Button size="sm" onClick={openAndInit} className="rounded-xl">
                  {t.retry[locale]}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
