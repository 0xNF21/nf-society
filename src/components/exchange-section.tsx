"use client";

import { useState, useEffect } from "react";
import { ArrowDownUp, Loader2, Copy, Check, QrCode } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { generatePaymentLink } from "@/lib/circles";

const MINT_HANDLER_ADDRESS = "0x1163c2192E26703d6b27E05D270226F481178dEF";

export default function ExchangeSection() {
  const { locale } = useLocale();
  const t = translations.exchange;
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrCode, setQrCode] = useState<string>("");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const paymentLink = generatePaymentLink(MINT_HANDLER_ADDRESS, 1, "Mint NF Society CRC");

  useEffect(() => {
    if (!showQr || !paymentLink) return;
    let active = true;
    setQrState("loading");
    (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const url = await toDataURL(paymentLink, { width: 220, margin: 1 });
        if (active) {
          setQrCode(url);
          setQrState("ready");
        }
      } catch {
        if (active) {
          setQrCode("");
          setQrState("error");
        }
      }
    })();
    return () => { active = false; };
  }, [showQr, paymentLink]);

  function handleCopy() {
    navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="w-full rounded-3xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-8 shadow-sm">
      <div className="flex flex-col items-center text-center gap-6">
        <div className="h-16 w-16 rounded-2xl bg-amber-50 flex items-center justify-center">
          <ArrowDownUp className="h-8 w-8 text-amber-500" />
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl font-bold text-ink">
            {t.title[locale]}
          </h2>
          <p className="text-sm text-ink/50 leading-relaxed max-w-md">
            {t.description[locale]}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={paymentLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors"
          >
            <ArrowDownUp className="h-4 w-4" />
            {t.sendCrc[locale]}
          </a>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl border-2 border-ink/10 text-ink/60 hover:bg-ink/5 transition-colors text-sm"
          >
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            {copied ? t.copied[locale] : t.copyLink[locale]}
          </button>
        </div>

        <button
          onClick={() => setShowQr(!showQr)}
          className="flex items-center gap-2 text-xs text-ink/40 hover:text-ink/60 transition-colors"
        >
          <QrCode className="h-4 w-4" />
          {showQr ? t.hideQr[locale] : t.showQr[locale]}
        </button>

        {showQr && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-ink/5">
            {qrState === "loading" && (
              <div className="w-[220px] h-[220px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-ink/30" />
              </div>
            )}
            {qrState === "ready" && qrCode && (
              <img src={qrCode} alt="QR Code" className="w-[220px] h-[220px]" />
            )}
            {qrState === "error" && (
              <div className="w-[220px] h-[220px] flex items-center justify-center text-xs text-red-400">
                QR Error
              </div>
            )}
            <p className="text-xs text-ink/40 mt-2">{t.scanQr[locale]}</p>
          </div>
        )}
      </div>
    </div>
  );
}
