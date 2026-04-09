"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CheckCircle, ChevronDown, Clipboard, Clock, HelpCircle, Lock, Loader2, QrCode, RefreshCw, Shield, Trophy, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { generatePaymentLink, generateGamePaymentLink } from "@/lib/circles";
import { encodeGameData } from "@/lib/game-data";
import { usePaymentWatcher } from "@/hooks/use-payment-watcher";
import { TicketHistory, type ParticipantEntry } from "@/components/payment-status";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { translations } from "@/lib/i18n";
import { darkSafeColor } from "@/lib/utils";
import { useMiniApp } from "@/components/miniapp-provider";

export type LotteryConfig = {
  id: number;
  slug: string;
  title: string;
  organizer: string;
  description: string | null;
  ticketPriceCrc: number;
  recipientAddress: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  theme: string;
  commissionPercent: number;
  status: string;
};

type DrawProof = {
  blockNumber: number;
  blockHash: string;
  participantCount: number;
  selectionIndex: number;
  method: string;
};

type DrawHistoryItem = {
  id: number;
  winnerAddress: string;
  blockNumber: number;
  blockHash: string;
  participantCount: number;
  selectionIndex: number;
  drawnAt: string;
};

function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ink/5 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left text-sm font-medium text-ink/80 hover:text-ink transition-colors"
      >
        {question}
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink/40 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="pb-4 text-sm text-ink/60 leading-relaxed animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}

export default function LotteryPage({ lottery, initialParticipants, initialCount }: { lottery: LotteryConfig; initialParticipants?: ParticipantEntry[]; initialCount?: number }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const { isMiniApp, walletAddress, sendPayment } = useMiniApp();
  const isDark = theme === "dark";
  const displayColor = darkSafeColor(lottery.primaryColor, isDark);
  const displayAccent = darkSafeColor(lottery.accentColor, isDark);
  const l = translations.lottery;
  const tm = translations.miniapp;

  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [qrCode, setQrCode] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [ticketCount, setTicketCount] = useState<number>(initialCount ?? 0);
  const [participantList, setParticipantList] = useState<ParticipantEntry[]>(initialParticipants ?? []);
  const [scanning, setScanning] = useState(false);
  const [winner, setWinner] = useState<any>(null);
  const [winnerProfile, setWinnerProfile] = useState<{ name: string; imageUrl: string | null } | null>(null);
  const [drawProof, setDrawProof] = useState<DrawProof | null>(null);
  const [faqOpen, setFaqOpen] = useState(false);
  const [drawHistory, setDrawHistory] = useState<DrawHistoryItem[]>([]);
  const [historyProfiles, setHistoryProfiles] = useState<Record<string, { name: string; imageUrl: string | null }>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [lotteryStatus] = useState(lottery.status);
  const [currentDescription] = useState(lottery.description || "");
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const confirmedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [miniAppPaying, setMiniAppPaying] = useState(false);
  const [miniAppError, setMiniAppError] = useState<string | null>(null);

  const paymentLink = useMemo(() => {
    return generateGamePaymentLink(lottery.recipientAddress, lottery.ticketPriceCrc, "lottery", lottery.slug);
  }, [lottery.recipientAddress, lottery.ticketPriceCrc, lottery.slug]);

  const dataValue = useMemo(
    () => encodeGameData({ game: "lottery", id: lottery.slug, v: 1 }),
    [lottery.slug]
  );

  const excludeTxHashes = useMemo(
    () => participantList.map(p => p.transactionHash),
    [participantList]
  );

  const { status: paymentStatus } = usePaymentWatcher({
    enabled: watchingPayment && lotteryStatus === "active",
    dataValue,
    minAmountCRC: lottery.ticketPriceCrc,
    recipientAddress: lottery.recipientAddress,
    excludeTxHashes,
  });

  const lotteryQuery = `lotteryId=${lottery.id}`;

  const scanAndRefresh = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`/api/scan?${lotteryQuery}`, { method: "POST" });
      const res = await fetch(`/api/participants?${lotteryQuery}`);
      const data = await res.json();
      if (data.count !== undefined) setTicketCount(data.count);
      if (data.participants) setParticipantList(data.participants);
    } catch (err) {
      console.error("Failed to scan/fetch", err);
    } finally {
      setScanning(false);
    }
  }, [lotteryQuery]);

  useEffect(() => {
    if (paymentStatus === "confirmed") {
      setWatchingPayment(false);
      setShowConfirmed(true);
      scanAndRefresh();
      if (confirmedTimerRef.current) clearTimeout(confirmedTimerRef.current);
      confirmedTimerRef.current = setTimeout(() => setShowConfirmed(false), 4000);
    }
  }, [paymentStatus, scanAndRefresh]);

  useEffect(() => {
    scanAndRefresh();
    const interval = setInterval(scanAndRefresh, 60000);
    return () => clearInterval(interval);
  }, [scanAndRefresh]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/draw?${lotteryQuery}`);
        const data = await res.json();
        if (data.draw) {
          setDrawProof(data.draw.proof);
          let profile = null;
          try {
            const profRes = await fetch("/api/profiles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ addresses: [data.draw.winnerAddress] }),
            });
            if (profRes.ok) {
              const profData = await profRes.json();
              const p = profData.profiles?.[data.draw.winnerAddress.toLowerCase()];
              if (p && (p.name || p.imageUrl)) profile = p;
            }
          } catch {}
          setWinnerProfile(profile);
          setWinner({ address: data.draw.winnerAddress });
        }
      } catch {}
    })();
  }, [lotteryQuery]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/draw/history?${lotteryQuery}`);
        const data = await res.json();
        if (data.draws && data.draws.length > 0) {
          const addresses = [...new Set(data.draws.map((d: DrawHistoryItem) => d.winnerAddress))];
          try {
            const profRes = await fetch("/api/profiles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ addresses }),
            });
            if (profRes.ok) {
              const profData = await profRes.json();
              if (profData.profiles) setHistoryProfiles(profData.profiles);
            }
          } catch {}
          setDrawHistory(data.draws);
        }
      } catch {}
    })();
  }, [lotteryQuery]);

  useEffect(() => {
    let active = true;
    if (!paymentLink) return;

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
  }, [paymentLink]);

  const handleMiniAppPay = async () => {
    setMiniAppPaying(true);
    setMiniAppError(null);
    try {
      const data = `lottery:${lottery.slug}`;
      await sendPayment(lottery.recipientAddress, lottery.ticketPriceCrc, data);
      setWatchingPayment(true);
      setTimeout(scanAndRefresh, 2000);
    } catch (err: any) {
      setMiniAppError(typeof err === "string" ? err : err?.message || tm.rejected[locale]);
    } finally {
      setMiniAppPaying(false);
    }
  };

  const handleCopy = async () => {
    if (!paymentLink) return;
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setCopyState("error");
    }
  };

  // Admin functions removed — use /admin page instead

  const isLotteryDark = lottery.theme === "dark";

  return (
    <div
      className={isLotteryDark ? "dark bg-gray-950 min-h-screen" : ""}
      style={{
        "--color-primary": lottery.primaryColor,
        "--color-accent": lottery.accentColor,
      } as React.CSSProperties}
    >
      <main className="px-4 py-10 md:py-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <div className="flex items-center">
            <Link
              href="/loteries"
              className="text-sm text-ink/50 hover:text-ink/80 transition-colors font-medium"
            >
              {l.backToLotteries[locale]}
            </Link>
          </div>
          <header className="space-y-4 text-center">
            {lottery.logoUrl && (
              <div className="flex justify-center mb-4">
                <Image src={lottery.logoUrl} alt={lottery.title} width={160} height={48} className="h-12 w-auto" priority />
              </div>
            )}
            <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">
              {lottery.title}
            </h1>
            <p className="max-w-2xl mx-auto text-lg text-ink/70">
              {(() => {
                const frDefault = `Achetez un ticket pour ${lottery.ticketPriceCrc} CRC et tentez de gagner le gros lot !`;
                if (!currentDescription || currentDescription === frDefault) {
                  return l.defaultDesc[locale](lottery.ticketPriceCrc);
                }
                return currentDescription;
              })()}
            </p>
            
            <div className="flex items-center justify-center gap-2 mt-6">
              <div className="bg-sand/50 border border-ink/10 rounded-full px-4 py-2 flex items-center gap-2 shadow-sm">
                <Users className="h-5 w-5 text-ink/60" />
                <span className="font-bold text-xl">{ticketCount}</span>
                <span className="text-ink/60 text-sm">{l.ticketsSold[locale]}</span>
              </div>
            </div>
          </header>

          {lotteryStatus !== "active" && (
            <div className={`rounded-2xl p-4 text-center font-medium ${
              lotteryStatus === "completed"
                ? "bg-amber-50 border-2 border-amber-200 text-amber-800"
                : "bg-gray-50 border-2 border-gray-200 text-gray-600"
            }`}>
              {lotteryStatus === "completed" ? l.lotteryCompleted[locale] : l.lotteryArchived[locale]}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className={`h-full border-2 border-ink/5 shadow-xl ${lotteryStatus !== "active" ? "opacity-60 pointer-events-none" : ""}`}>
              <CardHeader>
                <CardTitle>{l.participateTitle[locale]}</CardTitle>
                <CardDescription>
                  {l.participateDesc[locale](lottery.ticketPriceCrc)}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="bg-sand/30 rounded-2xl p-6 text-center border border-ink/5">
                  <span className="text-5xl font-bold text-ink">{lottery.ticketPriceCrc}</span>
                  <span className="text-xl font-semibold text-ink/60 ml-2">CRC</span>
                  <p className="text-xs text-ink/40 mt-2 uppercase tracking-widest">{l.ticketPrice[locale]}</p>
                </div>

                <div className="flex flex-col gap-3">
                  {isMiniApp && walletAddress ? (
                    <>
                      <Button
                        className="w-full h-12 text-lg"
                        style={{ backgroundColor: lottery.primaryColor }}
                        onClick={handleMiniAppPay}
                        disabled={miniAppPaying}
                      >
                        {miniAppPaying ? (
                          <><Loader2 className="h-5 w-5 animate-spin mr-2" />{tm.paying[locale]}</>
                        ) : (
                          tm.payBtn[locale].replace("{amount}", String(lottery.ticketPriceCrc))
                        )}
                      </Button>
                      {miniAppError && <p className="text-xs text-red-500 text-center">{miniAppError}</p>}
                    </>
                  ) : (
                    <>
                      <Button
                        className="w-full h-12 text-lg"
                        style={{ backgroundColor: lottery.primaryColor }}
                        asChild
                      >
                        <a href={paymentLink} target="_blank" rel="noreferrer" onClick={async () => { await scanAndRefresh(); setWatchingPayment(true); }}>
                          {l.buyTicket[locale]}
                          <ArrowUpRight className="h-5 w-5 ml-2" />
                        </a>
                      </Button>
                      <div className="grid grid-cols-2 gap-3">
                        <Button variant="outline" onClick={handleCopy}>
                          <Clipboard className="h-4 w-4 mr-2" />
                          {copyState === "copied" ? l.copied[locale] : l.copyLink[locale]}
                        </Button>
                        <Button variant="outline" onClick={async () => { const next = !showQr; setShowQr(next); if (next) { await scanAndRefresh(); setWatchingPayment(true); } }}>
                          <QrCode className="h-4 w-4 mr-2" />
                          {showQr ? l.hideQr[locale] : l.showQr[locale]}
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                {(watchingPayment || showConfirmed) && (
                  <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all ${
                    showConfirmed
                      ? "bg-green-50 border border-green-200 text-green-700"
                      : paymentStatus === "error"
                        ? "bg-red-50 border border-red-200 text-red-600"
                        : "bg-sand/40 border border-ink/10 text-ink/60"
                  }`}>
                    {showConfirmed ? (
                      <><CheckCircle className="h-4 w-4 shrink-0 text-green-600" />{locale === "fr" ? "Paiement détecté ! Mise à jour en cours..." : "Payment detected! Updating..."}</>
                    ) : paymentStatus === "error" ? (
                      <><span className="h-4 w-4 shrink-0">⚠️</span>{locale === "fr" ? "Erreur de détection" : "Detection error"}</>
                    ) : (
                      <><Loader2 className="h-4 w-4 shrink-0 animate-spin" />{locale === "fr" ? "En attente du paiement..." : "Waiting for payment..."}</>
                    )}
                  </div>
                )}

                {showQr && (
                  <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-white/70 p-4 text-xs text-ink/70 animate-in fade-in zoom-in duration-200">
                    {qrState === "ready" && qrCode ? (
                      <Image src={qrCode} alt="QR Code" width={200} height={200} className="rounded-xl border border-ink/10 bg-white p-2" unoptimized />
                    ) : (
                      <p>{l.qrGenerating[locale]}</p>
                    )}
                    <span>{l.qrScan[locale]}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="flex h-full flex-col border-2 border-ink/5 shadow-xl">
              <CardHeader>
                <CardTitle>{l.ticketHistory[locale]}</CardTitle>
                <CardDescription>{l.ticketHistoryDesc[locale]}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between">
                <TicketHistory
                  participants={participantList}
                  loading={scanning}
                  onRefresh={scanAndRefresh}
                  ticketPrice={lottery.ticketPriceCrc}
                />
              </CardContent>
            </Card>
          </div>

          {winner && (
            <Card className="border-4 border-yellow-400 bg-yellow-50/50 animate-in slide-in-from-bottom duration-500">
              <CardHeader className="text-center">
                <CardTitle className="flex items-center justify-center gap-3 text-2xl">
                  <Trophy className="h-8 w-8 text-yellow-600" />
                  {l.winnerTitle[locale]}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col items-center pb-8 gap-4">
                {winnerProfile?.imageUrl ? (
                  <img
                    src={winnerProfile.imageUrl}
                    alt={winnerProfile.name}
                    className="h-20 w-20 rounded-full object-cover border-4 border-yellow-300 shadow-lg"
                  />
                ) : (
                  <div className="h-20 w-20 rounded-full bg-yellow-200 flex items-center justify-center border-4 border-yellow-300">
                    <Trophy className="h-10 w-10 text-yellow-600" />
                  </div>
                )}
                <p className="text-3xl font-bold text-ink">
                  {winnerProfile?.name || winner.address.slice(0, 6) + "..." + winner.address.slice(-4)}
                </p>

                {drawProof && (
                  <div className="mt-4 w-full max-w-lg bg-white border border-ink/10 rounded-2xl p-5 text-left space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                      <Shield className="h-4 w-4" />
                      {l.verifiableProof[locale]}
                    </div>
                    <div className="space-y-2 text-xs text-ink/70">
                      <div className="flex justify-between">
                        <span className="font-medium text-ink/50">{l.gnosisBlock[locale]}</span>
                        <a
                          href={`https://gnosisscan.io/block/${drawProof.blockNumber}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-indigo-600 hover:underline"
                        >
                          #{drawProof.blockNumber}
                        </a>
                      </div>
                      <div className="flex justify-between items-start gap-4">
                        <span className="font-medium text-ink/50 shrink-0">{l.blockHash[locale]}</span>
                        <span className="font-mono text-[10px] text-ink/60 break-all text-right">
                          {drawProof.blockHash}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-ink/50">{l.participants[locale]}</span>
                        <span className="font-mono">{drawProof.participantCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-medium text-ink/50">{l.selectedIndex[locale]}</span>
                        <span className="font-mono">{drawProof.selectionIndex}</span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-ink/5">
                        <p className="text-[10px] text-ink/40">
                          <span className="font-semibold">{l.method[locale]} :</span> {drawProof.method}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="border-2 border-ink/5 shadow-xl rounded-3xl overflow-hidden">
            <button
              onClick={() => setFaqOpen(!faqOpen)}
              className="w-full flex items-center justify-between p-6 md:p-8 bg-white hover:bg-sand/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <HelpCircle className="h-6 w-6" style={{ color: displayAccent }} />
                <div className="text-left">
                  <h2 className="text-lg font-bold text-ink">{l.howItWorks[locale]}</h2>
                  <p className="text-sm text-ink/50 mt-0.5">{l.howItWorksSub[locale]}</p>
                </div>
              </div>
              <ChevronDown className={`h-5 w-5 text-ink/40 transition-transform duration-300 ${faqOpen ? "rotate-180" : ""}`} />
            </button>

            {faqOpen && (
              <div className="px-6 md:px-8 pb-6 md:pb-8 bg-white animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="divide-y divide-ink/5">
                  <FaqItem question={l.faq.howToParticipateQ[locale]}>
                    <p>{l.faq.howToParticipateA[locale](lottery.ticketPriceCrc)}</p>
                  </FaqItem>

                  <FaqItem question={l.faq.howWinnerQ[locale]}>
                    <div className="space-y-3">
                      <p>{l.faq.howWinnerIntro[locale]}</p>
                      <ol className="list-decimal list-inside space-y-2 ml-1">
                        <li><strong className="text-ink/70">{l.faq.howWinnerStep1Title[locale]}</strong> — {l.faq.howWinnerStep1[locale]}</li>
                        <li><strong className="text-ink/70">{l.faq.howWinnerStep2Title[locale]}</strong> — {l.faq.howWinnerStep2[locale]} <code className="bg-ink/5 px-1.5 py-0.5 rounded text-xs font-mono">nombre % nombre_de_participants</code>{l.faq.howWinnerStep2Result[locale]}</li>
                        <li><strong className="text-ink/70">{l.faq.howWinnerStep3Title[locale]}</strong> — {l.faq.howWinnerStep3[locale]}</li>
                      </ol>
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs">
                        <p className="font-semibold text-indigo-700 mb-1">{l.faq.whyReliableTitle[locale]}</p>
                        <p className="text-indigo-600/80">{l.faq.whyReliable[locale]}</p>
                      </div>
                    </div>
                  </FaqItem>

                  <FaqItem question={l.faq.howToVerifyQ[locale]}>
                    <div className="space-y-3">
                      <p>{l.faq.howToVerifyIntro[locale]}</p>
                      <div className="space-y-3">
                        <div className="bg-sand/30 rounded-xl p-3 border border-ink/5">
                          <p className="font-semibold text-ink/70 text-xs mb-1">{l.faq.verifyStep1Title[locale]}</p>
                          <p className="text-xs">{l.faq.verifyStep1[locale]}</p>
                        </div>
                        <div className="bg-sand/30 rounded-xl p-3 border border-ink/5">
                          <p className="font-semibold text-ink/70 text-xs mb-1">{l.faq.verifyStep2Title[locale]}</p>
                          <p className="text-xs mb-2">{l.faq.verifyStep2a[locale]}</p>
                          <p className="text-xs mb-2">{l.faq.verifyStep2Example[locale]} <code className="bg-ink/5 px-1 rounded font-mono text-[10px]">0x8fa2...3b9e1a7f0c4d2e8b</code>, {l.faq.verifyStep2Take[locale]} <code className="bg-ink/5 px-1 rounded font-mono text-[10px]">3b9e1a7f0c4d2e8b</code></p>
                          <p className="text-xs">{l.faq.verifyStep2Convert[locale]}</p>
                          <code className="block bg-ink/5 px-2 py-1.5 rounded font-mono text-[10px] mt-1">BigInt(&quot;0x3b9e1a7f0c4d2e8b&quot;) % BigInt(nombre_de_participants)</code>
                        </div>
                        <div className="bg-sand/30 rounded-xl p-3 border border-ink/5">
                          <p className="font-semibold text-ink/70 text-xs mb-1">{l.faq.verifyStep3Title[locale]}</p>
                          <p className="text-xs">{l.faq.verifyStep3[locale]}</p>
                        </div>
                      </div>
                      <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-xs">
                        <p className="font-semibold text-green-700 mb-1">{l.faq.summaryTitle[locale]}</p>
                        <p className="text-green-600/80">{l.faq.summary[locale]}</p>
                      </div>
                    </div>
                  </FaqItem>

                  <FaqItem question={l.faq.whoCanDrawQ[locale]}>
                    <p>{l.faq.whoCanDraw[locale]}</p>
                  </FaqItem>

                  <FaqItem question={l.faq.multipleTicketsQ[locale]}>
                    <p>{l.faq.multipleTickets[locale]}</p>
                  </FaqItem>

                  <FaqItem question={l.faq.whenDrawQ[locale]}>
                    <p>{l.faq.whenDraw[locale](lottery.organizer)}</p>
                  </FaqItem>
                </div>
              </div>
            )}
          </div>

          {drawHistory.length > 0 && (
            <div className="w-full max-w-2xl mt-8">
              <button
                className="w-full flex items-center justify-between px-6 py-4 bg-white border-2 border-ink/10 rounded-3xl shadow-sm hover:shadow-md transition-all group"
                onClick={() => setHistoryOpen(!historyOpen)}
              >
                <span className="flex items-center gap-2 font-bold text-ink">
                  <Clock className="h-5 w-5 text-ink/40" />
                  {l.drawHistory[locale]} ({drawHistory.length})
                </span>
                <ChevronDown className={`h-5 w-5 text-ink/40 transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`} />
              </button>
              {historyOpen && (
                <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                  {drawHistory.map((draw) => {
                    const prof = historyProfiles[draw.winnerAddress.toLowerCase()];
                    const displayName = prof?.name || `${draw.winnerAddress.slice(0, 6)}...${draw.winnerAddress.slice(-4)}`;
                    const drawDate = new Date(draw.drawnAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    return (
                      <div key={draw.id} className="bg-white border border-ink/10 rounded-2xl p-4 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                          {prof?.imageUrl ? (
                            <img src={prof.imageUrl} alt="" className="w-10 h-10 rounded-full border-2 border-amber-200" />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center border-2 border-amber-200">
                              <Trophy className="h-5 w-5 text-amber-600" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-bold text-ink truncate">{displayName}</p>
                            <p className="text-xs text-ink/40">{drawDate}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="bg-sand/30 rounded-lg p-2">
                            <span className="text-ink/40 block">{l.block[locale]}</span>
                            <a
                              href={`https://gnosisscan.io/block/${draw.blockNumber}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-mono text-blue-600 hover:underline"
                            >
                              #{draw.blockNumber}
                            </a>
                          </div>
                          <div className="bg-sand/30 rounded-lg p-2">
                            <span className="text-ink/40 block">{l.participants[locale]}</span>
                            <span className="font-mono font-semibold">{draw.participantCount}</span>
                          </div>
                          <div className="bg-sand/30 rounded-lg p-2 col-span-2">
                            <span className="text-ink/40 block">{l.blockHash[locale]}</span>
                            <span className="font-mono text-[10px] break-all">{draw.blockHash}</span>
                          </div>
                          <div className="bg-sand/30 rounded-lg p-2 col-span-2">
                            <span className="text-ink/40 block">{l.selectedIndex[locale]}</span>
                            <span className="font-mono font-semibold">{draw.selectionIndex}</span>
                            <span className="text-ink/30 ml-1">{l.position[locale](draw.selectionIndex, draw.participantCount)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <footer className="mt-12 pt-8 border-t border-ink/5" />
        </div>
      </main>
    </div>
  );
}
