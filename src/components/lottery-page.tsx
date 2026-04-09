"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Clock, HelpCircle, Lock, Loader2, Pencil, RefreshCw, Shield, Trophy, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { encodeGameData } from "@/lib/game-data";
import { usePaymentWatcher } from "@/hooks/use-payment-watcher";
import { TicketHistory, type ParticipantEntry } from "@/components/payment-status";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { translations } from "@/lib/i18n";
import { darkSafeColor } from "@/lib/utils";
import { ChancePayment } from "@/components/chance-payment";
import { PnlCard } from "@/components/pnl-card";

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
  const isDark = theme === "dark";
  const displayColor = darkSafeColor(lottery.primaryColor, isDark);
  const displayAccent = darkSafeColor(lottery.accentColor, isDark);
  const l = translations.lottery;

  const [ticketCount, setTicketCount] = useState<number>(initialCount ?? 0);
  const [participantList, setParticipantList] = useState<ParticipantEntry[]>(initialParticipants ?? []);
  const [scanning, setScanning] = useState(false);
  const [winner, setWinner] = useState<any>(null);
  const [winnerProfile, setWinnerProfile] = useState<{ name: string; imageUrl: string | null } | null>(null);
  const [drawLoading, setDrawLoading] = useState(false);
  const [drawProof, setDrawProof] = useState<DrawProof | null>(null);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [adminAuth, setAdminAuth] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [drawHistory, setDrawHistory] = useState<DrawHistoryItem[]>([]);
  const [historyProfiles, setHistoryProfiles] = useState<Record<string, { name: string; imageUrl: string | null }>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  const [lotteryStatus, setLotteryStatus] = useState(lottery.status);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(lottery.description || "");
  const [currentDescription, setCurrentDescription] = useState(lottery.description || "");
  const [savingDescription, setSavingDescription] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const confirmedTimerRef = useRef<NodeJS.Timeout | null>(null);

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


  const handleAdminLogin = async () => {
    if (!adminPassword.trim()) return;
    setAuthLoading(true);
    setAuthError("");
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      if (res.ok) {
        setAdminAuth(true);
        setAuthError("");
      } else {
        setAuthError("incorrectPassword");
      }
    } catch {
      setAuthError("connectionError");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    const confirmMsg = newStatus === "completed"
      ? l.confirmComplete[locale]
      : newStatus === "archived"
        ? l.confirmArchive[locale]
        : null;

    if (confirmMsg && !window.confirm(confirmMsg)) return;

    setStatusChanging(true);
    try {
      const res = await fetch(`/api/lotteries/${lottery.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword, status: newStatus }),
      });
      if (res.ok) {
        setLotteryStatus(newStatus);
      } else {
        alert(l.statusUpdateError[locale]);
      }
    } catch {
      alert(l.statusUpdateError[locale]);
    } finally {
      setStatusChanging(false);
    }
  };

  const handleSaveDescription = async () => {
    setSavingDescription(true);
    try {
      const res = await fetch(`/api/lotteries/${lottery.slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword, description: descriptionDraft }),
      });
      if (res.ok) {
        setCurrentDescription(descriptionDraft);
        setEditingDescription(false);
      } else {
        alert(l.descriptionUpdateError[locale]);
      }
    } catch {
      alert(l.descriptionUpdateError[locale]);
    } finally {
      setSavingDescription(false);
    }
  };

  const handleDraw = async () => {
    setDrawLoading(true);
    setWinner(null);
    setWinnerProfile(null);
    setDrawProof(null);
    try {
      const res = await fetch(`/api/draw?${lotteryQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword, lotteryId: lottery.id }),
      });
      const data = await res.json();
      if (data.error) {
        if (data.error === "Unauthorized") {
          setAdminAuth(false);
          setAuthError("sessionExpired");
        }
        return;
      }
      if (data.winner) {
        let profile = null;
        try {
          const profRes = await fetch("/api/profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: [data.winner.address] }),
          });
          if (profRes.ok) {
            const profData = await profRes.json();
            const p = profData.profiles?.[data.winner.address.toLowerCase()];
            if (p && (p.name || p.imageUrl)) profile = p;
          }
        } catch {}
        if (data.proof) setDrawProof(data.proof);
        setWinnerProfile(profile);
        setWinner(data.winner);
        try {
          const histRes = await fetch(`/api/draw/history?${lotteryQuery}`);
          const histData = await histRes.json();
          if (histData.draws) {
            setDrawHistory(histData.draws);
            const addrs = [...new Set(histData.draws.map((d: DrawHistoryItem) => d.winnerAddress))];
            try {
              const hp = await fetch("/api/profiles", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ addresses: addrs }),
              });
              if (hp.ok) {
                const hpData = await hp.json();
                if (hpData.profiles) setHistoryProfiles(hpData.profiles);
              }
            } catch {}
          }
        } catch {}
      }
    } catch (err) {
      console.error("Draw failed", err);
    } finally {
      setDrawLoading(false);
    }
  };

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

                <ChancePayment
                  recipientAddress={lottery.recipientAddress}
                  amountCrc={lottery.ticketPriceCrc}
                  gameType="lottery"
                  gameId={lottery.slug}
                  accentColor={lottery.primaryColor}
                  payLabel={l.buyTicket[locale]}
                  onPaymentInitiated={async () => { await scanAndRefresh(); setWatchingPayment(true); }}
                  onScan={scanAndRefresh}
                  scanning={scanning}
                  paymentStatus={showConfirmed ? "confirmed" : watchingPayment ? (paymentStatus === "error" ? "error" : "watching") : "idle"}
                  qrLabel={l.qrScan[locale]}
                />
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

          {/* PNL Card for winner */}
          {winner && (
            <PnlCard
              gameType="lottery"
              result="reward"
              gameLabel={`${l.winnerTitle[locale]} — ${lottery.title}`}
              rewardCrc={ticketCount * lottery.ticketPriceCrc * (1 - lottery.commissionPercent / 100)}
              betCrc={lottery.ticketPriceCrc}
              playerName={winnerProfile?.name || `${winner.address.slice(0, 6)}...${winner.address.slice(-4)}`}
              playerAvatar={winnerProfile?.imageUrl || undefined}
              stats={`${ticketCount} ${locale === "fr" ? "tickets" : "tickets"}`}
              date={new Date().toLocaleDateString()}
              locale={locale}
            />
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

          <footer className="mt-12 pt-8 border-t border-ink/5 flex flex-col items-center gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              className="text-ink/20 hover:text-ink/40"
              onClick={() => {
                setIsAdminOpen(!isAdminOpen);
                if (isAdminOpen) {
                  setAdminAuth(false);
                  setAdminPassword("");
                  setAuthError("");
                }
              }}
            >
              <Lock className="h-3 w-3 mr-1" />
              {l.adminZone[locale]}
            </Button>

            {isAdminOpen && !adminAuth && (
              <div className="bg-white border-2 border-ink/10 rounded-3xl p-8 shadow-2xl w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                <h3 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  {l.authRequired[locale]}
                </h3>
                <div className="space-y-4">
                  <input
                    type="password"
                    placeholder={l.adminPasswordPlaceholder[locale]}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                    className="w-full px-4 py-3 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  {authError && (
                    <p className="text-sm text-red-600 font-medium">{authError === "incorrectPassword" ? l.incorrectPassword[locale] : authError === "connectionError" ? l.connectionError[locale] : authError === "sessionExpired" ? l.sessionExpired[locale] : authError}</p>
                  )}
                  <Button
                    onClick={handleAdminLogin}
                    disabled={authLoading || !adminPassword.trim()}
                    className="w-full bg-ink hover:bg-ink/90 text-white font-semibold h-11 disabled:opacity-60"
                  >
                    {authLoading ? (
                      <span className="flex items-center gap-2">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        {l.verifying[locale]}
                      </span>
                    ) : (
                      l.login[locale]
                    )}
                  </Button>
                </div>
              </div>
            )}

            {isAdminOpen && adminAuth && (
              <div className="bg-white border-2 border-red-100 rounded-3xl p-8 shadow-2xl w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
                <h3 className="text-xl font-bold text-red-600 mb-4 flex items-center gap-2">
                  {l.drawPanel[locale]}
                </h3>
                <p className="text-sm text-ink/60 mb-4">
                  {l.drawDescription[locale]}
                </p>
                <p className="text-sm text-ink/60 mb-6">
                  {l.participantsInLottery[locale](ticketCount)}
                </p>
                <Button onClick={handleDraw} disabled={drawLoading} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12 shadow-lg shadow-red-200 disabled:opacity-60">
                  {drawLoading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      {l.drawInProgress[locale]}
                    </span>
                  ) : (
                    l.performDraw[locale]
                  )}
                </Button>

                <div className="mt-6 pt-6 border-t border-ink/10">
                  <h4 className="text-sm font-bold text-ink/60 mb-3 flex items-center gap-2">
                    <Pencil className="h-4 w-4" />
                    {l.editDescription[locale]}
                  </h4>
                  {editingDescription ? (
                    <div className="space-y-2">
                      <textarea
                        value={descriptionDraft}
                        onChange={(e) => setDescriptionDraft(e.target.value)}
                        rows={4}
                        className="w-full rounded-xl border border-ink/20 bg-white px-4 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 resize-none"
                        placeholder={l.descriptionLabel[locale]}
                      />
                      <div className="flex gap-2">
                        <Button
                          onClick={handleSaveDescription}
                          disabled={savingDescription}
                          className="flex-1 bg-ink hover:bg-ink/90 text-white font-semibold h-10"
                        >
                          {savingDescription ? (
                            <RefreshCw className="h-4 w-4 animate-spin" />
                          ) : (
                            l.saveDescription[locale]
                          )}
                        </Button>
                        <Button
                          onClick={() => { setEditingDescription(false); setDescriptionDraft(currentDescription); }}
                          variant="outline"
                          className="flex-1 border-ink/20 text-ink/60 font-semibold h-10"
                        >
                          {l.cancelEdit[locale]}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => { setDescriptionDraft(currentDescription); setEditingDescription(true); }}
                      variant="outline"
                      className="w-full border-ink/20 text-ink/70 hover:bg-ink/5 font-semibold"
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      {l.editDescription[locale]}
                    </Button>
                  )}
                </div>

                <div className="mt-6 pt-6 border-t border-ink/10">
                  <h4 className="text-sm font-bold text-ink/60 mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    {l.manageLottery[locale]}
                  </h4>
                  <div className="space-y-2">
                    {lotteryStatus === "active" && (
                      <Button
                        onClick={() => handleStatusChange("completed")}
                        disabled={statusChanging}
                        variant="outline"
                        className="w-full border-amber-300 text-amber-700 hover:bg-amber-50 font-semibold"
                      >
                        {l.markCompleted[locale]}
                      </Button>
                    )}
                    {lotteryStatus === "completed" && (
                      <>
                        <Button
                          onClick={() => handleStatusChange("active")}
                          disabled={statusChanging}
                          variant="outline"
                          className="w-full border-green-300 text-green-700 hover:bg-green-50 font-semibold"
                        >
                          {l.reactivateLottery[locale]}
                        </Button>
                        <Button
                          onClick={() => handleStatusChange("archived")}
                          disabled={statusChanging}
                          variant="outline"
                          className="w-full border-gray-300 text-gray-500 hover:bg-gray-50 font-semibold"
                        >
                          {l.archiveLottery[locale]}
                        </Button>
                      </>
                    )}
                    {lotteryStatus === "archived" && (
                      <Button
                        onClick={() => handleStatusChange("active")}
                        disabled={statusChanging}
                        variant="outline"
                        className="w-full border-green-300 text-green-700 hover:bg-green-50 font-semibold"
                      >
                        {l.reactivateLottery[locale]}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </footer>
        </div>
      </main>
    </div>
  );
}
