"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Copy, Check, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { generateGamePaymentLink } from "@/lib/circles";
import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { GAME_REGISTRY } from "@/lib/game-registry";

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
}

export function GamePayment({
  gameKey,
  game,
  playerToken,
  isCreator,
  onScanComplete,
  scanInterval = 5000,
}: GamePaymentProps) {
  const { locale } = useLocale();
  const config = GAME_REGISTRY[gameKey];
  const t = translations[config.translationKey as keyof typeof translations] as Record<string, Record<string, string>>;

  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const scanRef = useRef<NodeJS.Timeout | null>(null);

  const paymentLink = generateGamePaymentLink(
    game.recipientAddress,
    game.betCrc,
    gameKey,
    game.slug,
    playerToken,
  );

  const scanPayments = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      await fetch(`${config.scanRoute}?gameSlug=${game.slug}`, { method: "POST" });
      onScanComplete();
    } catch {}
    setScanning(false);
  }, [scanning, config.scanRoute, game.slug, onScanComplete]);

  // Auto-scan payments
  useEffect(() => {
    if (game.status !== "waiting_p1" && game.status !== "waiting_p2") {
      if (scanRef.current) { clearInterval(scanRef.current); scanRef.current = null; }
      return;
    }
    if (!scanRef.current) scanRef.current = setInterval(scanPayments, scanInterval);
    return () => { if (scanRef.current) { clearInterval(scanRef.current); scanRef.current = null; } };
  }, [game.status, scanPayments, scanInterval]);

  // Generate QR code
  useEffect(() => {
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
  }, [game.status, paymentLink]);

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

  return (
    <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
      <CardContent className="pt-2 px-4 pb-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-xs font-semibold text-ink/40 uppercase tracking-widest">
            {isCreator ? t.payToStart[locale] : t.payToJoin[locale]}
          </span>
          <span className="text-xs font-bold text-marine bg-marine/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">
            {game.betCrc} CRC
          </span>
        </div>

        {/* Pay button */}
        <a href={paymentLink} target="_blank" rel="noreferrer">
          <Button className="w-full rounded-xl font-bold" style={{ background: config.accentColor }}>
            {t.payCrc[locale].replace("{bet}", String(game.betCrc))}
          </Button>
        </a>

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

        {/* Manual scan */}
        <button onClick={scanPayments} disabled={scanning}
          className="w-full text-xs text-ink/40 hover:text-ink/60 flex items-center justify-center gap-1.5 transition-colors">
          <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? t.scanningPayments[locale] : t.scanPayments[locale]}
        </button>
      </CardContent>
    </Card>
  );
}
