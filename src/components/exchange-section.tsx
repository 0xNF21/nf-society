"use client";

import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { RefreshCw, ArrowDownUp, CheckCircle, XCircle, Loader2, Copy, Check } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { translations, Locale } from "@/lib/i18n";

const SAFE_ADDRESS = "0x960A0784640fD6581D221A56df1c60b65b5ebB6f";

function generateCirclesPaymentLink(): string {
  return `https://circles.garden/profile/${SAFE_ADDRESS}`;
}

type Exchange = {
  id: number;
  senderAddress: string;
  amountHuman: string;
  incomingTxHash: string;
  outgoingTxHash: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
};

function shortenAddress(addr: string): string {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function shortenTx(tx: string): string {
  return tx.slice(0, 10) + "..." + tx.slice(-6);
}

export default function ExchangeSection() {
  const { locale } = useLocale();
  const t = translations.exchange;
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [safeBalance, setSafeBalance] = useState<string>("...");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadExchanges() {
    try {
      const res = await fetch("/api/exchange", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setExchanges(data.exchanges || []);
        setSafeBalance(data.safeNfCrcBalance || "0");
      }
    } catch {}
  }

  useEffect(() => { loadExchanges(); }, []);

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/exchange", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setScanResult(t.scanError[locale]);
      } else if (data.processed === 0) {
        setScanResult(t.noNewPayments[locale]);
      } else {
        const successCount = data.exchanges.filter((e: any) => e.status === "success").length;
        const failCount = data.exchanges.filter((e: any) => e.status === "failed").length;
        let msg = `${successCount} ${t.exchangesDone[locale]}`;
        if (failCount > 0) msg += ` / ${failCount} ${t.exchangesFailed[locale]}`;
        setScanResult(msg);
      }
      await loadExchanges();
    } catch {
      setScanResult(t.scanError[locale]);
    }
    setScanning(false);
  }

  function copyAddress() {
    navigator.clipboard.writeText(SAFE_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const paymentLink = generateCirclesPaymentLink();

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

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-ink/5">
          <QRCodeSVG
            value={paymentLink}
            size={180}
            bgColor="#ffffff"
            fgColor="#000000"
            level="M"
            includeMargin={false}
          />
        </div>

        <div className="space-y-2 w-full max-w-sm">
          <p className="text-xs text-ink/40">{t.sendTo[locale]}</p>
          <button
            onClick={copyAddress}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-ink/5 hover:bg-ink/10 transition-colors text-xs font-mono text-ink/70"
          >
            {shortenAddress(SAFE_ADDRESS)}
            {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-ink/40">
          <span>{t.availableBalance[locale]}:</span>
          <span className="font-semibold text-ink/70">{parseFloat(safeBalance).toFixed(2)} NF CRC</span>
        </div>

        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-amber-500 text-white font-semibold hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          {scanning ? t.scanning[locale] : t.checkExchange[locale]}
        </button>

        {scanResult && (
          <p className="text-sm text-ink/60 bg-ink/5 px-4 py-2 rounded-xl">
            {scanResult}
          </p>
        )}

        {exchanges.length > 0 && (
          <div className="w-full mt-2">
            <h3 className="text-sm font-semibold text-ink/70 mb-3 text-left">
              {t.recentExchanges[locale]}
            </h3>
            <div className="space-y-2">
              {exchanges.slice(0, 5).map((ex) => (
                <div
                  key={ex.id}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-ink/5 text-xs"
                >
                  <div className="flex items-center gap-2">
                    {ex.status === "success" ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : ex.status === "failed" ? (
                      <XCircle className="h-4 w-4 text-red-500" />
                    ) : (
                      <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />
                    )}
                    <a
                      href={`https://gnosisscan.io/address/${ex.senderAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-ink/60 hover:text-ink/80"
                    >
                      {shortenAddress(ex.senderAddress)}
                    </a>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-ink/80">
                      {parseFloat(ex.amountHuman).toFixed(2)} CRC
                    </span>
                    {ex.outgoingTxHash && (
                      <a
                        href={`https://gnosisscan.io/tx/${ex.outgoingTxHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-500 hover:text-amber-600 font-mono"
                      >
                        {shortenTx(ex.outgoingTxHash)}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
