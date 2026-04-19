"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Copy, Check, Loader2, QrCode, RefreshCw, CheckCircle, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateGamePaymentLink } from "@/lib/circles";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { useMiniApp } from "@/components/miniapp-provider";
import { TicketRecovery } from "@/components/ticket-recovery";
import { BalancePayButton } from "@/components/balance-pay-button";
import { useConnectedAddress } from "@/hooks/use-connected-address";

interface ChancePaymentProps {
  /** Recipient address for the payment */
  recipientAddress: string;
  /** Amount in CRC */
  amountCrc: number;
  /** Game type identifier (e.g. "lottery", "lootbox") */
  gameType: string;
  /** Unique game/slug identifier */
  gameId: string;
  /** Accent color for the pay button */
  accentColor: string;
  /** Label for the pay button in standalone mode */
  payLabel: string;
  /** Called after payment is initiated (Mini App) or button clicked (standalone) */
  onPaymentInitiated?: () => void;
  /** Called to manually trigger a scan */
  onScan?: () => Promise<void>;
  /** Whether a scan is in progress */
  scanning?: boolean;
  /** Payment detection status */
  paymentStatus?: "idle" | "watching" | "confirmed" | "error";
  /** QR scan instruction text */
  qrLabel?: string;
  /** Player token for identifying the payer (encoded in payment data) */
  playerToken?: string;
  /** Optional ball value (CRC per ball) for games like Plinko — encoded as bv{N} */
  ballValue?: number;
  /** Optional table slug — used by ticket recovery when gameId is composite (mines, keno, coin-flip) */
  tableSlug?: string;
  /** Optional extras for pay-from-balance — ballValue (plinko), mineCount (mines), pickCount (keno) */
  balanceExtras?: { ballValue?: number; mineCount?: number; pickCount?: number };
  /** Game key used for pay-from-balance (defaults to gameType — use when gameType != internal wallet key). */
  balanceGameKey?: string;
  /** Slug for pay-from-balance (defaults to tableSlug or gameId — use when gameId is composite). */
  balanceSlug?: string;
  /** Called when a balance-pay succeeds (debit + game row created). Parent should refresh or navigate. */
  onBalancePaid?: (result: any) => void;
}

export function ChancePayment({
  recipientAddress,
  amountCrc,
  gameType,
  gameId,
  accentColor,
  payLabel,
  onPaymentInitiated,
  onScan,
  scanning = false,
  paymentStatus = "idle",
  qrLabel,
  playerToken,
  ballValue,
  tableSlug,
  balanceExtras,
  balanceGameKey,
  balanceSlug,
  onBalancePaid,
}: ChancePaymentProps) {
  const { locale } = useLocale();
  const { isMiniApp, walletAddress, sendPayment } = useMiniApp();
  const connectedAddress = useConnectedAddress();
  const tm = translations.miniapp;

  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [miniAppPaying, setMiniAppPaying] = useState(false);
  const [miniAppError, setMiniAppError] = useState<string | null>(null);
  const [miniAppSuccess, setMiniAppSuccess] = useState(false);

  const paymentLink = generateGamePaymentLink(recipientAddress, amountCrc, gameType, gameId, playerToken, ballValue);

  // Generate QR code (standalone only)
  useEffect(() => {
    if (isMiniApp) return;
    if (!showQr || !paymentLink) return;
    let active = true;
    setQrState("loading");
    (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const url = await toDataURL(paymentLink, { width: 220, margin: 1 });
        if (active) { setQrCode(url); setQrState("ready"); }
      } catch {
        if (active) { setQrCode(""); setQrState("error"); }
      }
    })();
    return () => { active = false; };
  }, [showQr, paymentLink, isMiniApp]);

  const tokenReady = !!playerToken;

  async function handleMiniAppPay() {
    if (!tokenReady) return;
    setMiniAppPaying(true);
    setMiniAppError(null);
    try {
      const parts = [gameType, gameId, playerToken!];
      if (ballValue !== undefined && ballValue > 0) parts.push(`bv${ballValue}`);
      const data = parts.join(":");
      await sendPayment(recipientAddress, amountCrc, data);
      setMiniAppSuccess(true);
      onPaymentInitiated?.();
    } catch (err: any) {
      setMiniAppError(typeof err === "string" ? err : err?.message || tm.rejected[locale]);
    } finally {
      setMiniAppPaying(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Resolve pay-from-balance params (fallback to the on-chain ones).
  const balKey = balanceGameKey || gameType;
  const balSlug = balanceSlug || tableSlug || gameId;
  const balExtras = balanceExtras || (ballValue !== undefined ? { ballValue } : undefined);

  return (
    <div className="space-y-4">
      {/* Pay-from-balance — shown above the normal flow when balance >= amount.
          Component renders nothing when balance is insufficient, keeping the
          default on-chain UI as the only option. */}
      <BalancePayButton
        gameKey={balKey}
        slug={balSlug}
        amountCrc={amountCrc}
        playerToken={playerToken}
        address={connectedAddress || undefined}
        extras={balExtras}
        onSuccess={onBalancePaid}
        accentColor={accentColor}
      />

      {/* -- Mini App mode -- */}
      {isMiniApp && walletAddress ? (
        <>
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/50">
            <Wallet className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              {tm.connected[locale]} — {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
            </span>
          </div>

          {miniAppSuccess ? (
            <div className="flex items-center gap-2 justify-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {tm.txSuccess[locale]}
              </span>
            </div>
          ) : (
            <Button
              className="w-full h-12 text-lg font-bold"
              style={{ backgroundColor: accentColor }}
              onClick={handleMiniAppPay}
              disabled={miniAppPaying || !tokenReady}
            >
              {miniAppPaying ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" />{tm.paying[locale]}</>
              ) : !tokenReady ? (
                <><Loader2 className="h-5 w-5 animate-spin mr-2" />{tm.preparing[locale]}</>
              ) : (
                tm.payBtn[locale].replace("{amount}", String(amountCrc))
              )}
            </Button>
          )}
          {miniAppError && <p className="text-xs text-red-500 text-center">{miniAppError}</p>}
        </>
      ) : (
        /* -- Standalone mode -- */
        <>
          {tokenReady ? (
            <Button
              className="w-full h-12 text-lg font-bold"
              style={{ backgroundColor: accentColor }}
              asChild
            >
              <a
                href={paymentLink}
                target="_blank"
                rel="noreferrer"
                onClick={() => onPaymentInitiated?.()}
              >
                {payLabel}
              </a>
            </Button>
          ) : (
            <Button
              className="w-full h-12 text-lg font-bold"
              style={{ backgroundColor: accentColor }}
              disabled
            >
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {tm.preparing[locale]}
            </Button>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
              {copied
                ? (locale === "fr" ? "Copie !" : "Copied!")
                : (locale === "fr" ? "Copier le lien" : "Copy link")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                const next = !showQr;
                setShowQr(next);
                if (next) onPaymentInitiated?.();
              }}
            >
              <QrCode className="h-4 w-4" />
              {showQr
                ? (locale === "fr" ? "Masquer QR" : "Hide QR")
                : (locale === "fr" ? "QR Code" : "QR Code")}
            </Button>
          </div>

          {showQr && (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-white/70 dark:bg-white/5 p-4 text-xs text-ink/70">
              {qrState === "loading" && (
                <div className="w-[220px] h-[220px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-ink/20" />
                </div>
              )}
              {qrState === "ready" && qrCode && (
                <img src={qrCode} alt="QR Code" className="w-[220px] h-[220px] rounded-xl" />
              )}
              {qrState === "error" && (
                <div className="w-[220px] h-[220px] flex items-center justify-center text-xs text-red-400">QR Error</div>
              )}
              <span>{qrLabel || (locale === "fr" ? "Scannez pour payer" : "Scan to pay")}</span>
            </div>
          )}
        </>
      )}

      {/* -- Payment status feedback -- */}
      {paymentStatus === "watching" && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium bg-white/60 dark:bg-white/5 border border-ink/10 text-ink/60">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          {locale === "fr" ? "En attente du paiement..." : "Waiting for payment..."}
        </div>
      )}
      {paymentStatus === "confirmed" && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium bg-green-50 border border-green-200 text-green-700">
          <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
          {locale === "fr" ? "Paiement detecte !" : "Payment detected!"}
        </div>
      )}
      {paymentStatus === "error" && (
        <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium bg-red-50 border border-red-200 text-red-600">
          <span className="h-4 w-4 shrink-0">&#9888;&#65039;</span>
          {locale === "fr" ? "Erreur de detection" : "Detection error"}
        </div>
      )}

      {/* -- Manual scan -- */}
      {onScan && (
        <button
          onClick={onScan}
          disabled={scanning}
          className="w-full text-xs text-ink/40 hover:text-ink/60 flex items-center justify-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
          {scanning
            ? (locale === "fr" ? "Scan en cours..." : "Scanning...")
            : (locale === "fr" ? "Scanner les paiements" : "Scan payments")}
        </button>
      )}

      {/* -- Ticket recovery (bureau des tickets perdus) -- */}
      <TicketRecovery gameKey={gameType} slug={tableSlug || gameId} />
    </div>
  );
}
