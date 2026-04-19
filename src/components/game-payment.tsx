"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check, RefreshCw, Loader2, CheckCircle2, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { generateGamePaymentLink } from "@/lib/circles";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { GAME_REGISTRY } from "@/lib/game-registry";
import { useMiniApp } from "@/components/miniapp-provider";
import { TicketRecovery } from "@/components/ticket-recovery";
import { BalancePayButton } from "@/components/balance-pay-button";
import { useConnectedAddress } from "@/hooks/use-connected-address";

interface GamePaymentProps {
  gameKey: string;
  game: {
    recipientAddress: string;
    betCrc: number;
    slug: string;
    status: string;
  };
  playerToken: string;
  isCreator: boolean;
  onScanComplete: () => void;
  scanInterval?: number;
  /** Optional callback when a balance-pay succeeds. Parent should refresh the game. */
  onBalancePaid?: (result: any) => void;
}

export function GamePayment({
  gameKey,
  game,
  playerToken,
  isCreator,
  onScanComplete,
  scanInterval = 5000,
  onBalancePaid,
}: GamePaymentProps) {
  const { locale } = useLocale();
  const { isMiniApp, walletAddress, sendPayment } = useMiniApp();
  const connectedAddress = useConnectedAddress();
  const config = GAME_REGISTRY[gameKey];
  const t = translations[config.translationKey as keyof typeof translations] as Record<string, Record<string, string>>;
  const tm = translations.miniapp;

  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [miniAppPaying, setMiniAppPaying] = useState(false);
  const [miniAppError, setMiniAppError] = useState<string | null>(null);
  const [miniAppSuccess, setMiniAppSuccess] = useState(false);
  const scanRef = useRef<NodeJS.Timeout | null>(null);

  const tokenReady = !!playerToken;
  const paymentLink = generateGamePaymentLink(
    game.recipientAddress,
    game.betCrc,
    gameKey,
    game.slug,
    playerToken,
  );

  const scanningRef = useRef(false);
  const onScanCompleteRef = useRef(onScanComplete);
  onScanCompleteRef.current = onScanComplete;

  const scanPayments = useCallback(async () => {
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    try {
      await fetch(`${config.scanRoute}?gameSlug=${game.slug}`, { method: "POST" });
      onScanCompleteRef.current();
    } catch {}
    scanningRef.current = false;
    setScanning(false);
  }, [config.scanRoute, game.slug]);

  // Auto-scan payments
  useEffect(() => {
    if (game.status !== "waiting_p1" && game.status !== "waiting_p2") {
      if (scanRef.current) { clearInterval(scanRef.current); scanRef.current = null; }
      return;
    }
    const id = setInterval(scanPayments, scanInterval);
    scanRef.current = id;
    return () => clearInterval(id);
  }, [game.status, scanPayments, scanInterval]);

  // Generate QR code (only in standalone mode)
  useEffect(() => {
    if (isMiniApp) return; // Skip QR in Mini App mode
    if (game.status !== "waiting_p1" && game.status !== "waiting_p2") return;
    let active = true;
    setQrState("loading");
    (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const url = await toDataURL(paymentLink, { width: 220, margin: 1, color: { dark: "#1b1b1f", light: "#ffffff" } });
        if (active) { setQrCode(url); setQrState("ready"); }
      } catch {
        if (active) { setQrCode(""); setQrState("error"); }
      }
    })();
    return () => { active = false; };
  }, [game.status, paymentLink, isMiniApp]);

  // Mini App: pay directly via Circles host wallet
  async function handleMiniAppPay() {
    if (!tokenReady) return;
    setMiniAppPaying(true);
    setMiniAppError(null);
    try {
      const data = [gameKey, game.slug, playerToken].join(":");
      await sendPayment(game.recipientAddress, game.betCrc, data);
      setMiniAppSuccess(true);
      // Trigger scan to detect the on-chain payment
      setTimeout(scanPayments, 2000);
    } catch (err: any) {
      setMiniAppError(typeof err === "string" ? err : err?.message || tm.rejected[locale]);
    } finally {
      setMiniAppPaying(false);
    }
  }

  function copyPaymentLink() {
    navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyGameLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  if (game.status !== "waiting_p1" && game.status !== "waiting_p2") return null;

  // J1 has paid, waiting for J2 — show confirmation + invite
  if (game.status === "waiting_p2" && isCreator) {
    return (
      <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
        <CardContent className="pt-4 px-4 pb-4 space-y-4">
          {/* Payment confirmed */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {locale === "fr" ? "Paiement reçu !" : "Payment received!"}
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                {game.betCrc} CRC
              </p>
            </div>
          </div>

          {/* Waiting for P2 */}
          <div className="flex items-center gap-2 justify-center text-ink/50 dark:text-white/50">
            <Users className="w-4 h-4" />
            <span className="text-sm font-semibold">
              {locale === "fr" ? "En attente du joueur 2..." : "Waiting for player 2..."}
            </span>
          </div>

          {/* Share game link */}
          <div className="space-y-2">
            <p className="text-xs text-ink/40 dark:text-white/40 text-center">
              {locale === "fr" ? "Partage ce lien pour inviter un adversaire" : "Share this link to invite an opponent"}
            </p>
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2.5 rounded-xl border border-ink/10 bg-white/80 dark:bg-white/5 text-xs font-mono text-ink/70 dark:text-white/70 truncate text-center">
                {game.slug}
              </code>
              <Button variant="outline" size="sm" onClick={copyGameLink} className="rounded-xl border-ink/15 gap-1.5 shrink-0">
                {copiedLink ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? t.copied[locale] : t.inviteP2[locale]}
              </Button>
            </div>
          </div>

          {/* Manual scan */}
          <button onClick={scanPayments} disabled={scanning}
            className="w-full text-xs text-ink/40 hover:text-ink/60 flex items-center justify-center gap-1.5 transition-colors">
            <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? t.scanningPayments[locale] : t.scanPayments[locale]}
          </button>

          {/* Ticket recovery for the creator who lost their token */}
          <TicketRecovery gameKey={gameKey} slug={game.slug} />
        </CardContent>
      </Card>
    );
  }

  // Show payment form (J1 needs to pay, or J2 needs to pay)
  return (
    <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
      <CardContent className="pt-2 px-4 pb-4 space-y-3">
        {/* Pay-from-balance — appears above the on-chain flow when the
            connected address has enough CRC on balance. Renders nothing
            otherwise, so the existing QR + Mini App UI stays unchanged. */}
        <BalancePayButton
          gameKey={gameKey}
          slug={game.slug}
          amountCrc={game.betCrc}
          playerToken={playerToken}
          address={connectedAddress || undefined}
          onSuccess={(result) => {
            onBalancePaid?.(result);
            // Trigger parent refresh so the game state reflects the new slot.
            onScanCompleteRef.current();
          }}
          accentColor={GAME_REGISTRY[gameKey]?.accentColor || "#251B9F"}
        />
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-xs font-semibold text-ink/40 uppercase tracking-widest">
            {isCreator ? t.payToStart[locale] : t.payToJoin[locale]}
          </span>
          <span className="text-xs font-bold text-marine bg-marine/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
            {game.betCrc} CRC
          </span>
        </div>

        {/* ── Mini App mode: direct payment button ── */}
        {isMiniApp && walletAddress ? (
          <div className="space-y-3">
            {/* Connected wallet indicator */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/50">
              <Wallet className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                {tm.connected[locale]} — {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
            </div>

            {/* Pay button */}
            {miniAppSuccess ? (
              <div className="flex items-center gap-2 justify-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                  {tm.txSuccess[locale]}
                </span>
              </div>
            ) : (
              <Button
                className="w-full rounded-xl font-bold"
                style={{ background: config.accentColor }}
                onClick={handleMiniAppPay}
                disabled={miniAppPaying || !tokenReady}
              >
                {miniAppPaying ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />{tm.paying[locale]}</>
                ) : !tokenReady ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" />{tm.preparing[locale]}</>
                ) : (
                  tm.payBtn[locale].replace("{amount}", String(game.betCrc))
                )}
              </Button>
            )}

            {/* Error */}
            {miniAppError && (
              <p className="text-xs text-red-500 text-center">{miniAppError}</p>
            )}

            {/* Copy / invite buttons (still useful for sharing) */}
            {isCreator && game.status === "waiting_p1" && (
              <Button variant="outline" size="sm" onClick={copyGameLink} className="w-full rounded-xl text-xs border-ink/15 gap-1.5">
                {copiedLink ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? t.copied[locale] : t.inviteP2[locale]}
              </Button>
            )}
          </div>
        ) : (
          /* ── Standalone mode: QR code + Gnosis link ── */
          <>
            {/* Pay button */}
            {tokenReady ? (
              <a href={paymentLink} target="_blank" rel="noreferrer">
                <Button className="w-full rounded-xl font-bold" style={{ background: config.accentColor }}>
                  {t.payCrc[locale].replace("{bet}", String(game.betCrc))}
                </Button>
              </a>
            ) : (
              <Button className="w-full rounded-xl font-bold" style={{ background: config.accentColor }} disabled>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                {tm.preparing[locale]}
              </Button>
            )}

            {/* Copy buttons */}
            <div className={`grid gap-2 ${isCreator && game.status === "waiting_p1" ? "grid-cols-2" : "grid-cols-1"}`}>
              <Button variant="outline" size="sm" onClick={copyPaymentLink} className="rounded-xl text-xs border-ink/15 gap-1.5">
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t.copied[locale] : t.copyPayLink[locale]}
              </Button>
              {isCreator && game.status === "waiting_p1" && (
                <Button variant="outline" size="sm" onClick={copyGameLink} className="rounded-xl text-xs border-ink/15 gap-1.5">
                  {copiedLink ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedLink ? t.copied[locale] : t.inviteP2[locale]}
                </Button>
              )}
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="bg-white rounded-2xl p-4 shadow-lg border border-ink/5">
                {qrState === "loading" && (
                  <div className="w-[220px] h-[220px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-ink/20" />
                  </div>
                )}
                {qrState === "ready" && qrCode && <img src={qrCode} alt="QR Code" className="w-[220px] h-[220px]" />}
                {qrState === "error" && (
                  <div className="w-[220px] h-[220px] flex items-center justify-center text-xs text-red-400">QR Error</div>
                )}
                <p className="text-xs text-ink/40 mt-2 text-center">
                  {locale === "fr" ? "Scannez pour ouvrir dans Gnosis App" : "Scan to open in Gnosis App"}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Manual scan */}
        <button onClick={scanPayments} disabled={scanning}
          className="w-full text-xs text-ink/40 hover:text-ink/60 flex items-center justify-center gap-1.5 transition-colors">
          <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? t.scanningPayments[locale] : t.scanPayments[locale]}
        </button>

        {/* Ticket recovery (bureau des tickets perdus) */}
        <TicketRecovery gameKey={gameKey} slug={game.slug} />
      </CardContent>
    </Card>
  );
}
