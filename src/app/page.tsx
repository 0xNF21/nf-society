"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Image from "next/image";
import { ArrowUpRight, Clipboard, QrCode, RefreshCw, Trophy, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { circlesConfig, generatePaymentLink } from "@/lib/circles";
import { TicketHistory, type ParticipantEntry } from "@/components/payment-status";

const LOTTERY_RECIPIENT = "0xbf57dc790ba892590c640dc27b26b2665d30104f"; 
const TICKET_PRICE = 5;
const TICKET_NOTE = "Loterie NF Society Ticket";

export default function Home() {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [qrCode, setQrCode] = useState("");
  const [showQr, setShowQr] = useState(false);
  const [ticketCount, setTicketCount] = useState<number>(0);
  const [participantList, setParticipantList] = useState<ParticipantEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [winner, setWinner] = useState<any>(null);
  const [winnerProfile, setWinnerProfile] = useState<{ name: string; imageUrl: string | null } | null>(null);
  const [drawLoading, setDrawLoading] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);

  const paymentLink = useMemo(() => {
    return generatePaymentLink(LOTTERY_RECIPIENT, TICKET_PRICE, TICKET_NOTE);
  }, []);

  const scanAndRefresh = useCallback(async () => {
    setScanning(true);
    try {
      await fetch("/api/scan", { method: "POST" });
      const res = await fetch("/api/participants");
      const data = await res.json();
      if (data.count !== undefined) setTicketCount(data.count);
      if (data.participants) setParticipantList(data.participants);
    } catch (err) {
      console.error("Failed to scan/fetch", err);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    scanAndRefresh();
    const interval = setInterval(scanAndRefresh, 30000);
    return () => clearInterval(interval);
  }, [scanAndRefresh]);

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

  const handleDraw = async () => {
    setDrawLoading(true);
    setWinner(null);
    setWinnerProfile(null);
    try {
      const res = await fetch("/api/draw", { method: "POST" });
      const data = await res.json();
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
        setWinnerProfile(profile);
        setWinner(data.winner);
      }
    } catch (err) {
      console.error("Draw failed", err);
    } finally {
      setDrawLoading(false);
    }
  };

  return (
    <main className="px-4 py-10 md:py-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <header className="space-y-4 text-center">
          <div className="flex justify-center mb-4">
             <Image src="/logo-color.png" alt="NF Society" width={160} height={48} className="h-12 w-auto" priority />
          </div>
          <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">
            Loterie NF Society
          </h1>
          <p className="max-w-2xl mx-auto text-lg text-ink/70">
            Achetez un ticket pour 5 CRC et tentez de gagner le gros lot !
          </p>
          
          <div className="flex items-center justify-center gap-2 mt-6">
            <div className="bg-sand/50 border border-ink/10 rounded-full px-4 py-2 flex items-center gap-2 shadow-sm">
              <Users className="h-5 w-5 text-ink/60" />
              <span className="font-bold text-xl">{ticketCount}</span>
              <span className="text-ink/60 text-sm">tickets vendus</span>
            </div>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="h-full border-2 border-ink/5 shadow-xl">
            <CardHeader>
              <CardTitle>Participer à la loterie</CardTitle>
              <CardDescription>
                Payez 5 CRC pour entrer dans la liste des participants.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="bg-sand/30 rounded-2xl p-6 text-center border border-ink/5">
                <span className="text-5xl font-bold text-ink">5</span>
                <span className="text-xl font-semibold text-ink/60 ml-2">CRC</span>
                <p className="text-xs text-ink/40 mt-2 uppercase tracking-widest">Prix du ticket</p>
              </div>

              <div className="flex flex-col gap-3">
                <Button className="w-full h-12 text-lg" asChild>
                  <a href={paymentLink} target="_blank" rel="noreferrer">
                    Acheter mon ticket
                    <ArrowUpRight className="h-5 w-5 ml-2" />
                  </a>
                </Button>
                <div className="grid grid-cols-2 gap-3">
                  <Button variant="outline" onClick={handleCopy}>
                    <Clipboard className="h-4 w-4 mr-2" />
                    {copyState === "copied" ? "Copié" : "Copier le lien"}
                  </Button>
                  <Button variant="outline" onClick={() => setShowQr((prev) => !prev)}>
                    <QrCode className="h-4 w-4 mr-2" />
                    {showQr ? "Masquer QR" : "Afficher QR"}
                  </Button>
                </div>
              </div>

              {showQr && (
                <div className="flex flex-col items-center gap-3 rounded-2xl border border-ink/10 bg-white/70 p-4 text-xs text-ink/70 animate-in fade-in zoom-in duration-200">
                  {qrState === "ready" && qrCode ? (
                    <Image src={qrCode} alt="QR Code" width={200} height={200} className="rounded-xl border border-ink/10 bg-white p-2" unoptimized />
                  ) : (
                    <p>Génération du QR Code...</p>
                  )}
                  <span>Scannez pour ouvrir dans Gnosis App</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex h-full flex-col border-2 border-ink/5 shadow-xl">
            <CardHeader>
              <CardTitle>Historique des tickets</CardTitle>
              <CardDescription>Liste des paiements confirmés sur la blockchain.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between">
              <TicketHistory
                participants={participantList}
                loading={scanning}
                onRefresh={scanAndRefresh}
              />
            </CardContent>
          </Card>
        </div>

        {winner && (
          <Card className="border-4 border-yellow-400 bg-yellow-50/50 animate-in slide-in-from-bottom duration-500">
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-3 text-2xl">
                <Trophy className="h-8 w-8 text-yellow-600" />
                Gagnant Sélectionné !
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
            </CardContent>
          </Card>
        )}

        <footer className="mt-12 pt-8 border-t border-ink/5 flex flex-col items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-ink/20 hover:text-ink/40"
            onClick={() => setIsAdminOpen(!isAdminOpen)}
          >
            Zone Admin
          </Button>

          {isAdminOpen && (
            <div className="bg-white border-2 border-red-100 rounded-3xl p-8 shadow-2xl w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h3 className="text-xl font-bold text-red-600 mb-4 flex items-center gap-2">
                Panneau de Tirage
              </h3>
              <p className="text-sm text-ink/60 mb-6">
                Cliquez sur le bouton ci-dessous pour choisir aléatoirement un gagnant parmi les {ticketCount} participants.
              </p>
              <Button onClick={handleDraw} disabled={drawLoading} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-12 shadow-lg shadow-red-200 disabled:opacity-60">
                {drawLoading ? (
                  <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Tirage en cours...
                  </span>
                ) : (
                  "EFFECTUER LE TIRAGE"
                )}
              </Button>
            </div>
          )}
        </footer>
      </div>
    </main>
  );
}
