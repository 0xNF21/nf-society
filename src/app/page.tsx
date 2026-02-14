"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Image from "next/image";
import { ArrowUpRight, ChevronDown, Clipboard, Clock, HelpCircle, Lock, QrCode, RefreshCw, Shield, Trophy, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { circlesConfig, generatePaymentLink } from "@/lib/circles";
import { TicketHistory, type ParticipantEntry } from "@/components/payment-status";

const LOTTERY_RECIPIENT = "0xbf57dc790ba892590c640dc27b26b2665d30104f"; 
const TICKET_PRICE = 5;
const TICKET_NOTE = "Loterie NF Society Ticket";

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
    (async () => {
      try {
        const res = await fetch("/api/draw");
        const data = await res.json();
        if (data.draw) {
          setWinner({ address: data.draw.winnerAddress });
          setDrawProof(data.draw.proof);
          try {
            const profRes = await fetch("/api/profiles", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ addresses: [data.draw.winnerAddress] }),
            });
            if (profRes.ok) {
              const profData = await profRes.json();
              const p = profData.profiles?.[data.draw.winnerAddress.toLowerCase()];
              if (p && (p.name || p.imageUrl)) setWinnerProfile(p);
            }
          } catch {}
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/draw/history");
        const data = await res.json();
        if (data.draws && data.draws.length > 0) {
          setDrawHistory(data.draws);
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
        }
      } catch {}
    })();
  }, []);

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
        setAuthError("Mot de passe incorrect");
      }
    } catch {
      setAuthError("Erreur de connexion");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDraw = async () => {
    setDrawLoading(true);
    setWinner(null);
    setWinnerProfile(null);
    setDrawProof(null);
    try {
      const res = await fetch("/api/draw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: adminPassword }),
      });
      const data = await res.json();
      if (data.error) {
        if (data.error === "Unauthorized") {
          setAdminAuth(false);
          setAuthError("Session expirée, veuillez vous reconnecter");
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
          const histRes = await fetch("/api/draw/history");
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
                Gagnant du dernier tirage
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
                    Preuve de tirage vérifiable
                  </div>
                  <div className="space-y-2 text-xs text-ink/70">
                    <div className="flex justify-between">
                      <span className="font-medium text-ink/50">Bloc Gnosis</span>
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
                      <span className="font-medium text-ink/50 shrink-0">Hash du bloc</span>
                      <span className="font-mono text-[10px] text-ink/60 break-all text-right">
                        {drawProof.blockHash}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-ink/50">Participants</span>
                      <span className="font-mono">{drawProof.participantCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium text-ink/50">Index sélectionné</span>
                      <span className="font-mono">{drawProof.selectionIndex}</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-ink/5">
                      <p className="text-[10px] text-ink/40">
                        <span className="font-semibold">Méthode :</span> {drawProof.method}
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
              <HelpCircle className="h-6 w-6 text-indigo-500" />
              <div className="text-left">
                <h2 className="text-lg font-bold text-ink">Comment ça marche ?</h2>
                <p className="text-sm text-ink/50 mt-0.5">Tout savoir sur la loterie et la transparence du tirage</p>
              </div>
            </div>
            <ChevronDown className={`h-5 w-5 text-ink/40 transition-transform duration-300 ${faqOpen ? "rotate-180" : ""}`} />
          </button>

          {faqOpen && (
            <div className="px-6 md:px-8 pb-6 md:pb-8 bg-white animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="divide-y divide-ink/5">
                <FaqItem question="Comment participer ?">
                  <p>Envoyez exactement 5 CRC à l&apos;adresse de la loterie en cliquant sur &laquo; Acheter mon ticket &raquo;. Le paiement se fait via l&apos;application Gnosis/Circles. Une fois le paiement confirmé sur la blockchain, votre ticket apparaît automatiquement dans l&apos;historique.</p>
                </FaqItem>

                <FaqItem question="Comment le gagnant est-il choisi ?">
                  <div className="space-y-3">
                    <p>Le gagnant est sélectionné de manière <strong className="text-ink/80">100% transparente et vérifiable</strong> grâce à la blockchain. Voici le processus exact :</p>
                    <ol className="list-decimal list-inside space-y-2 ml-1">
                      <li><strong className="text-ink/70">Récupération du bloc</strong> — Au moment du tirage, le système récupère le dernier bloc validé sur la blockchain Gnosis. Ce bloc contient un &laquo; hash &raquo; (une empreinte numérique unique) qui est généré par le réseau et que <em>personne ne peut prédire ni manipuler</em>.</li>
                      <li><strong className="text-ink/70">Calcul du gagnant</strong> — On prend les 16 derniers caractères hexadécimaux du hash du bloc. On les convertit en nombre. Puis on fait le calcul : <code className="bg-ink/5 px-1.5 py-0.5 rounded text-xs font-mono">nombre % nombre_de_participants</code>. Le résultat donne la position du gagnant dans la liste.</li>
                      <li><strong className="text-ink/70">Affichage public</strong> — Le numéro de bloc, le hash complet, le nombre de participants et l&apos;index obtenu sont affichés publiquement pour que chacun puisse vérifier.</li>
                    </ol>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs">
                      <p className="font-semibold text-indigo-700 mb-1">Pourquoi c&apos;est fiable ?</p>
                      <p className="text-indigo-600/80">Le hash d&apos;un bloc blockchain est créé par des centaines de validateurs indépendants. L&apos;organisateur de la loterie n&apos;a aucun contrôle dessus. C&apos;est comme demander à un notaire impartial de tirer le numéro gagnant.</p>
                    </div>
                  </div>
                </FaqItem>

                <FaqItem question="Comment vérifier le tirage soi-même ?">
                  <div className="space-y-3">
                    <p>Après chaque tirage, toutes les informations nécessaires sont affichées publiquement. Voici comment vérifier étape par étape :</p>
                    <div className="space-y-3">
                      <div className="bg-sand/30 rounded-xl p-3 border border-ink/5">
                        <p className="font-semibold text-ink/70 text-xs mb-1">Étape 1 — Vérifier le hash du bloc</p>
                        <p className="text-xs">Cliquez sur le numéro de bloc affiché dans la preuve (c&apos;est un lien vers GnosisScan). Vérifiez que le hash affiché sur GnosisScan est bien le même que celui affiché sur notre site.</p>
                      </div>
                      <div className="bg-sand/30 rounded-xl p-3 border border-ink/5">
                        <p className="font-semibold text-ink/70 text-xs mb-1">Étape 2 — Refaire le calcul</p>
                        <p className="text-xs mb-2">Prenez le hash du bloc et gardez seulement les 16 derniers caractères (sans le &laquo; 0x &raquo; du début).</p>
                        <p className="text-xs mb-2">Exemple : si le hash est <code className="bg-ink/5 px-1 rounded font-mono text-[10px]">0x8fa2...3b9e1a7f0c4d2e8b</code>, prenez <code className="bg-ink/5 px-1 rounded font-mono text-[10px]">3b9e1a7f0c4d2e8b</code></p>
                        <p className="text-xs">Convertissez ce nombre hexadécimal en décimal. Vous pouvez utiliser un convertisseur en ligne ou taper dans la console de votre navigateur (F12) :</p>
                        <code className="block bg-ink/5 px-2 py-1.5 rounded font-mono text-[10px] mt-1">BigInt(&quot;0x3b9e1a7f0c4d2e8b&quot;) % BigInt(nombre_de_participants)</code>
                      </div>
                      <div className="bg-sand/30 rounded-xl p-3 border border-ink/5">
                        <p className="font-semibold text-ink/70 text-xs mb-1">Étape 3 — Comparer</p>
                        <p className="text-xs">Le résultat de votre calcul doit correspondre exactement à l&apos;&laquo; Index sélectionné &raquo; affiché dans la preuve. Cet index correspond à la position du gagnant dans la liste des participants (en partant de 0).</p>
                      </div>
                    </div>
                    <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-xs">
                      <p className="font-semibold text-green-700 mb-1">En résumé</p>
                      <p className="text-green-600/80">Si le hash sur GnosisScan correspond et que votre calcul donne le même index que celui affiché, alors le tirage est vérifié : le gagnant a bien été choisi de manière aléatoire et personne n&apos;a pu tricher.</p>
                    </div>
                  </div>
                </FaqItem>

                <FaqItem question="Qui peut effectuer le tirage ?">
                  <p>Seul l&apos;administrateur de la loterie peut déclencher le tirage, via une zone protégée par mot de passe. Cependant, le résultat et sa preuve sont toujours publics et vérifiables par tous les visiteurs du site.</p>
                </FaqItem>

                <FaqItem question="Est-ce qu'on peut acheter plusieurs tickets ?">
                  <p>Chaque adresse Circles ne peut acheter qu&apos;un seul ticket par loterie. Si vous envoyez un deuxième paiement depuis la même adresse, il ne sera pas comptabilisé comme un ticket supplémentaire.</p>
                </FaqItem>

                <FaqItem question="Quand a lieu le tirage ?">
                  <p>Le tirage est effectué par l&apos;administrateur une fois que suffisamment de participants ont rejoint la loterie. La date exacte sera communiquée par NF Society.</p>
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
                Historique des tirages ({drawHistory.length})
              </span>
              <ChevronDown className={`h-5 w-5 text-ink/40 transition-transform duration-200 ${historyOpen ? "rotate-180" : ""}`} />
            </button>
            {historyOpen && (
              <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                {drawHistory.map((draw) => {
                  const prof = historyProfiles[draw.winnerAddress.toLowerCase()];
                  const displayName = prof?.name || `${draw.winnerAddress.slice(0, 6)}...${draw.winnerAddress.slice(-4)}`;
                  const drawDate = new Date(draw.drawnAt).toLocaleDateString("fr-FR", {
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
                          <span className="text-ink/40 block">Bloc</span>
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
                          <span className="text-ink/40 block">Participants</span>
                          <span className="font-mono font-semibold">{draw.participantCount}</span>
                        </div>
                        <div className="bg-sand/30 rounded-lg p-2 col-span-2">
                          <span className="text-ink/40 block">Hash du bloc</span>
                          <span className="font-mono text-[10px] break-all">{draw.blockHash}</span>
                        </div>
                        <div className="bg-sand/30 rounded-lg p-2 col-span-2">
                          <span className="text-ink/40 block">Index sélectionné</span>
                          <span className="font-mono font-semibold">{draw.selectionIndex}</span>
                          <span className="text-ink/30 ml-1">(position {draw.selectionIndex} sur {draw.participantCount})</span>
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
            Zone Admin
          </Button>

          {isAdminOpen && !adminAuth && (
            <div className="bg-white border-2 border-ink/10 rounded-3xl p-8 shadow-2xl w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h3 className="text-lg font-bold text-ink mb-4 flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Authentification requise
              </h3>
              <div className="space-y-4">
                <input
                  type="password"
                  placeholder="Mot de passe admin"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdminLogin()}
                  className="w-full px-4 py-3 border-2 border-ink/10 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                />
                {authError && (
                  <p className="text-sm text-red-600 font-medium">{authError}</p>
                )}
                <Button
                  onClick={handleAdminLogin}
                  disabled={authLoading || !adminPassword.trim()}
                  className="w-full bg-ink hover:bg-ink/90 text-white font-semibold h-11 disabled:opacity-60"
                >
                  {authLoading ? (
                    <span className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      Vérification...
                    </span>
                  ) : (
                    "Se connecter"
                  )}
                </Button>
              </div>
            </div>
          )}

          {isAdminOpen && adminAuth && (
            <div className="bg-white border-2 border-red-100 rounded-3xl p-8 shadow-2xl w-full max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h3 className="text-xl font-bold text-red-600 mb-4 flex items-center gap-2">
                Panneau de Tirage
              </h3>
              <p className="text-sm text-ink/60 mb-4">
                Le tirage utilise le hash du dernier bloc de la blockchain Gnosis comme source d&apos;aléatoire. Le résultat est vérifiable par tous.
              </p>
              <p className="text-sm text-ink/60 mb-6">
                {ticketCount} participant{ticketCount !== 1 ? "s" : ""} dans la loterie.
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
