"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check, RefreshCw, Loader2, CheckCircle2, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { generateGamePaymentLink } from "@/lib/circles";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { useMiniApp } from "@/components/miniapp-provider";
import { useConnectedAddress } from "@/hooks/use-connected-address";
import { BalancePayButton } from "@/components/balance-pay-button";
import { GAME_REGISTRY } from "@/lib/game-registry";
import type { RacePlayer } from "@/lib/crc-races";

interface Props {
  game: {
    slug: string;
    betCrc: number;
    recipientAddress: string;
    status: string;
    maxPlayers: number;
    players: RacePlayer[];
  };
  playerToken: string;
  onScanComplete: () => void;
  scanInterval?: number;
}

export function CrcRacesPayment({ game, playerToken, onScanComplete, scanInterval = 5000 }: Props) {
  const { locale } = useLocale();
  const { isMiniApp, walletAddress, sendPayment } = useMiniApp();
  const connectedAddress = useConnectedAddress();
  const t = translations.crcRaces;
  const tm = translations.miniapp;
  const config = GAME_REGISTRY["crc-races"];

  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [miniAppPaying, setMiniAppPaying] = useState(false);
  const [miniAppError, setMiniAppError] = useState<string | null>(null);
  const [miniAppSuccess, setMiniAppSuccess] = useState(false);
  const scanRef = useRef<NodeJS.Timeout | null>(null);

  const paymentLink = generateGamePaymentLink(
    game.recipientAddress,
    game.betCrc,
    "crc-races",
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
      await fetch(`/api/crc-races-scan?gameSlug=${game.slug}`, { method: "POST" });
      onScanCompleteRef.current();
    } catch {}
    scanningRef.current = false;
    setScanning(false);
  }, [game.slug]);

  // Auto-scan while waiting
  useEffect(() => {
    if (game.status !== "waiting") {
      if (scanRef.current) { clearInterval(scanRef.current); scanRef.current = null; }
      return;
    }
    const id = setInterval(scanPayments, scanInterval);
    scanRef.current = id;
    return () => clearInterval(id);
  }, [game.status, scanPayments, scanInterval]);

  // QR code generation (standalone mode only)
  useEffect(() => {
    if (isMiniApp) return;
    if (game.status !== "waiting") return;
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

  async function handleMiniAppPay() {
    setMiniAppPaying(true);
    setMiniAppError(null);
    try {
      const data = ["crc-races", game.slug, playerToken].join(":");
      await sendPayment(game.recipientAddress, game.betCrc, data);
      setMiniAppSuccess(true);
      setTimeout(scanPayments, 2000);
    } catch (err: unknown) {
      const msg = typeof err === "string" ? err : err instanceof Error ? err.message : tm.rejected[locale];
      setMiniAppError(msg);
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

  if (game.status !== "waiting") return null;

  const currentCount = Array.isArray(game.players) ? game.players.length : 0;
  const iAmIn = Array.isArray(game.players) && game.players.some((p) => p.token && p.token === playerToken);

  // If player has already paid, show waiting view
  if (iAmIn) {
    return (
      <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
        <CardContent className="pt-4 px-4 pb-4 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                {t.paymentReceived[locale]}
              </p>
              <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">{game.betCrc} CRC</p>
            </div>
          </div>

          <div className="flex items-center gap-2 justify-center text-ink/50 dark:text-white/50">
            <Users className="w-4 h-4" />
            <span className="text-sm font-semibold">
              {t.waitingSlots[locale].replace("{current}", String(currentCount)).replace("{max}", String(game.maxPlayers))}
            </span>
          </div>

          <div className="space-y-2">
            <p className="text-xs text-ink/40 dark:text-white/40 text-center">
              {t.shareInviteRacers[locale]}
            </p>
            <div className="flex gap-2">
              <code className="flex-1 px-3 py-2.5 rounded-xl border border-ink/10 bg-white/80 dark:bg-white/5 text-xs font-mono text-ink/70 dark:text-white/70 truncate text-center">
                {game.slug}
              </code>
              <Button variant="outline" size="sm" onClick={copyGameLink} className="rounded-xl border-ink/15 gap-1.5 shrink-0">
                {copiedLink ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? t.copied[locale] : t.inviteOthers[locale]}
              </Button>
            </div>
          </div>

          <button onClick={scanPayments} disabled={scanning}
            className="w-full text-xs text-ink/40 hover:text-ink/60 flex items-center justify-center gap-1.5 transition-colors">
            <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? t.scanningPayments[locale] : t.scanPayments[locale]}
          </button>
        </CardContent>
      </Card>
    );
  }

  // Payment form (not yet paid)
  return (
    <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
      <CardContent className="pt-2 px-4 pb-4 space-y-3">
        {/* Pay-from-balance — renders nothing when the connected address has
            not enough balance, so the on-chain / Mini App flow below stays
            unchanged. onSuccess triggers a parent refresh so the new racer
            appears in the players list. */}
        <BalancePayButton
          gameKey="crc-races"
          slug={game.slug}
          amountCrc={game.betCrc}
          playerToken={playerToken}
          address={walletAddress || connectedAddress || undefined}
          onSuccess={onScanComplete}
          accentColor={config.accentColor}
        />
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-xs font-semibold text-ink/40 uppercase tracking-widest">
            {t.payToJoin[locale].replace("{bet}", String(game.betCrc))}
          </span>
          <span className="text-xs font-bold text-marine bg-marine/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
            {currentCount}/{game.maxPlayers}
          </span>
        </div>

        {isMiniApp && walletAddress ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/50 dark:border-emerald-800/50">
              <Wallet className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                {tm.connected[locale]} — {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </span>
            </div>

            {miniAppSuccess ? (
              <div className="flex items-center gap-2 justify-center p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{tm.txSuccess[locale]}</span>
              </div>
            ) : (
              <Button className="w-full rounded-xl font-bold" style={{ background: config.accentColor }}
                onClick={handleMiniAppPay} disabled={miniAppPaying}>
                {miniAppPaying
                  ? <><Loader2 className="w-4 h-4 animate-spin mr-2" />{tm.paying[locale]}</>
                  : tm.payBtn[locale].replace("{amount}", String(game.betCrc))}
              </Button>
            )}

            {miniAppError && <p className="text-xs text-red-500 text-center">{miniAppError}</p>}
          </div>
        ) : (
          <>
            <a href={paymentLink} target="_blank" rel="noreferrer">
              <Button className="w-full rounded-xl font-bold" style={{ background: config.accentColor }}>
                {t.payCrc[locale].replace("{bet}", String(game.betCrc))}
              </Button>
            </a>

            <div className="grid gap-2 grid-cols-2">
              <Button variant="outline" size="sm" onClick={copyPaymentLink} className="rounded-xl text-xs border-ink/15 gap-1.5">
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? t.copied[locale] : t.copyPayLink[locale]}
              </Button>
              <Button variant="outline" size="sm" onClick={copyGameLink} className="rounded-xl text-xs border-ink/15 gap-1.5">
                {copiedLink ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedLink ? t.copied[locale] : t.inviteOthers[locale]}
              </Button>
            </div>

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
                  {t.scanOpenGnosis[locale]}
                </p>
              </div>
            </div>
          </>
        )}

        <button onClick={scanPayments} disabled={scanning}
          className="w-full text-xs text-ink/40 hover:text-ink/60 flex items-center justify-center gap-1.5 transition-colors">
          <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? t.scanningPayments[locale] : t.scanPayments[locale]}
        </button>
      </CardContent>
    </Card>
  );
}
