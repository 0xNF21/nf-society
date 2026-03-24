"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Check, RefreshCw, Trophy, Clock, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { generateGamePaymentLink } from "@/lib/circles";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";

type GameStatus = "waiting_p1" | "waiting_p2" | "active" | "finished" | "cancelled";

interface MorpionGame {
  id: number;
  slug: string;
  betCrc: number;
  recipientAddress: string;
  commissionPct: number;
  player1Address: string | null;
  player2Address: string | null;
  board: string;
  currentTurn: string;
  status: GameStatus;
  result: string | null;
  winnerAddress: string | null;
  payoutStatus: string;
}

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

const WIN_LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

function getWinLine(board: string): number[] | null {
  for (const [a,b,c] of WIN_LINES) {
    if (board[a] !== "-" && board[a] === board[b] && board[b] === board[c]) return [a,b,c];
  }
  return null;
}

function PlayerBadge({ addr, profile, symbol, isMe, waitingLabel, youLabel }: {
  addr: string | null;
  profile?: { name: string; imageUrl: string | null };
  symbol: string;
  isMe: boolean;
  waitingLabel: string;
  youLabel: string;
}) {
  if (!addr) return (
    <div className="flex items-center gap-2">
      <div className="w-7 h-7 rounded-full bg-ink/10 flex items-center justify-center text-xs text-ink/30 animate-pulse">?</div>
      <span className="text-xs text-ink/30">{waitingLabel}</span>
    </div>
  );
  const name = profile?.name || shortenAddress(addr);
  const avatar = profile?.imageUrl;
  return (
    <div className="flex items-center gap-2">
      {avatar ? (
        <img src={avatar} alt={name} className="w-7 h-7 rounded-full object-cover border border-ink/10" />
      ) : (
        <img src={symbol === "X" ? "/morpion/player1.png" : "/morpion/player2.png"} alt={symbol}
          className="w-7 h-7 object-contain" />
      )}
      <div>
        <span className="text-xs font-semibold text-ink/70 block leading-tight">{name}</span>
        {isMe && <span className="text-[10px] text-ink/30">{youLabel}</span>}
      </div>
    </div>
  );
}

// ─── Demo Morpion (client-only vs bot) ───
function DemoMorpionGame({ slug }: { slug: string }) {
  const { locale } = useLocale();
  const { addXp, demoPlayer } = useDemo();
  const t = translations.morpion;
  const [board, setBoard] = useState("---------");
  const [currentTurn, setCurrentTurn] = useState<"X" | "O">("X");
  const [status, setStatus] = useState<"active" | "finished">("active");
  const [result, setResult] = useState<string | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [xpGained, setXpGained] = useState(0);

  const WINS = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];

  function checkWinner(b: string): "X" | "O" | "draw" | null {
    for (const [a, c2, c3] of WINS) {
      if (b[a] !== "-" && b[a] === b[c2] && b[c2] === b[c3]) return b[a] as "X" | "O";
    }
    if (!b.includes("-")) return "draw";
    return null;
  }

  function getWinLine(b: string): number[] | null {
    for (const [a, c2, c3] of WINS) {
      if (b[a] !== "-" && b[a] === b[c2] && b[c2] === b[c3]) return [a, c2, c3];
    }
    return null;
  }

  // Simple bot: try to win, then block, then center, then random
  function botMove(b: string): number {
    const empty = b.split("").map((c, i) => c === "-" ? i : -1).filter(i => i >= 0);
    // Try to win
    for (const pos of empty) {
      const test = b.slice(0, pos) + "O" + b.slice(pos + 1);
      if (checkWinner(test) === "O") return pos;
    }
    // Block player
    for (const pos of empty) {
      const test = b.slice(0, pos) + "X" + b.slice(pos + 1);
      if (checkWinner(test) === "X") return pos;
    }
    // Center
    if (empty.includes(4)) return 4;
    // Random
    return empty[Math.floor(Math.random() * empty.length)];
  }

  function makeMove(pos: number) {
    if (status !== "active" || currentTurn !== "X" || board[pos] !== "-" || botThinking) return;
    const newBoard = board.slice(0, pos) + "X" + board.slice(pos + 1);
    setBoard(newBoard);
    const winner = checkWinner(newBoard);
    if (winner) {
      setStatus("finished");
      setResult(winner === "draw" ? "draw" : winner);
      if (winner === "X") setXpGained(addXp("morpion_win"));
      else if (winner === "draw") setXpGained(addXp("morpion_lose"));
      return;
    }
    setCurrentTurn("O");
    setBotThinking(true);
  }

  // Bot plays after player
  useEffect(() => {
    if (currentTurn !== "O" || status !== "active" || !botThinking) return;
    const timeout = setTimeout(() => {
      const pos = botMove(board);
      const newBoard = board.slice(0, pos) + "O" + board.slice(pos + 1);
      setBoard(newBoard);
      const winner = checkWinner(newBoard);
      if (winner) {
        setStatus("finished");
        setResult(winner === "draw" ? "draw" : winner);
        if (winner === "O") setXpGained(addXp("morpion_lose"));
        else if (winner === "draw") setXpGained(addXp("morpion_lose"));
      } else {
        setCurrentTurn("X");
      }
      setBotThinking(false);
    }, 600);
    return () => clearTimeout(timeout);
  }, [currentTurn, status, botThinking, board]);

  const winLine = status === "finished" ? getWinLine(board) : null;
  const isMyTurn = currentTurn === "X" && status === "active";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-6">
          <Link href="/morpion" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
          </Link>
          <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-lg font-bold">DEMO</span>
        </div>

        {/* Status */}
        <Card className="mb-4 rounded-xl border-0 shadow-sm bg-white/60 backdrop-blur-sm">
          <CardContent className="p-0 overflow-hidden text-center">
            {status === "active" && (
              <div className="flex items-center justify-center gap-2 py-3 px-4">
                <span className="text-lg font-bold text-ink">
                  {isMyTurn ? (t.yourTurn[locale]) : (botThinking ? "🤖 Bot..." : `${t.turnOf[locale]} Bot`)}
                </span>
              </div>
            )}
            {status === "finished" && result === "draw" && (
              <p className="text-sm font-bold text-ink/70 py-3 px-4">{t.draw[locale]}</p>
            )}
            {status === "finished" && result === "X" && (
              <div className="flex flex-col items-center gap-1 py-3 px-4">
                <div className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-citrus" />
                  <span className="font-bold text-ink">{t.youWon[locale]} 🎉</span>
                </div>
                {xpGained > 0 && <span className="text-xs text-emerald-600 font-bold">+{xpGained} XP</span>}
              </div>
            )}
            {status === "finished" && result === "O" && (
              <div className="py-3 px-4">
                <p className="text-2xl text-center">🤖</p>
                <p className="font-bold text-ink text-sm">{locale === "fr" ? "Le bot a gagné !" : "Bot wins!"}</p>
                {xpGained > 0 && <p className="text-xs text-emerald-600 font-bold">+{xpGained} XP</p>}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Board */}
        <Card className="mb-4 bg-white/70 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-2">
              {board.split("").map((cell, i) => {
                const isEmpty = cell === "-";
                const canClick = isEmpty && isMyTurn && !botThinking;
                const isWinCell = winLine?.includes(i) ?? false;
                const winSymbol = winLine ? board[winLine[0]] : null;
                return (
                  <button key={i} onClick={() => canClick && makeMove(i)}
                    className={`aspect-square rounded-xl flex items-center justify-center transition-all border-2 select-none text-3xl font-black
                      ${isWinCell && winSymbol === "X" ? "border-emerald-400 bg-emerald-100 scale-105" :
                        isWinCell && winSymbol === "O" ? "border-violet-400 bg-violet-100 scale-105" :
                        cell === "X" ? "border-emerald-400/40 bg-emerald-50 text-emerald-600" :
                        cell === "O" ? "border-violet-400/40 bg-violet-50 text-violet-600" :
                        canClick ? "border-ink/10 bg-white hover:border-marine/30 hover:bg-marine/5 cursor-pointer" :
                        "border-ink/5 bg-white/50 cursor-default"}`}
                  >
                    {cell !== "-" ? cell : ""}
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Players */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-white/60 backdrop-blur-sm border border-ink/10 rounded-xl p-3">
            <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1.5">J1</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-emerald-600">X</span>
              <span className="text-xs font-semibold text-ink/70">{demoPlayer.name} <span className="text-ink/30">({locale === "fr" ? "vous" : "you"})</span></span>
            </div>
          </div>
          <div className="bg-white/60 backdrop-blur-sm border border-ink/10 rounded-xl p-3">
            <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1.5">J2</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-violet-600">O</span>
              <span className="text-xs font-semibold text-ink/70">🤖 Bot</span>
            </div>
          </div>
        </div>

        {status === "finished" && (
          <Link href="/morpion">
            <Button className="w-full rounded-xl font-bold mt-4" style={{ background: "#251B9F" }}>
              {locale === "fr" ? "Rejouer" : "Play again"}
            </Button>
          </Link>
        )}

        <p className="text-center text-xs text-ink/40 mt-2">
          {t.youPlay[locale]} <span className="font-bold text-emerald-600">X</span>
        </p>
      </div>
    </div>
  );
}

export default function MorpionGamePage() {
  const { slug } = useParams<{ slug: string }>();
  const { isDemo } = useDemo();

  // Demo mode: play locally vs bot
  if (isDemo && slug.startsWith("DEMO")) {
    return <DemoMorpionGame slug={slug} />;
  }

  return <RealMorpionGame slug={slug} />;
}

function RealMorpionGame({ slug }: { slug: string }) {
  const { locale } = useLocale();
  const t = translations.morpion;
  const [game, setGame] = useState<MorpionGame | null>(null);
  const [myAddress, setMyAddress] = useState("");
  const [addressInput, setAddressInput] = useState("");
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [moveError, setMoveError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, { name: string; imageUrl: string | null }>>({});
  const [isCreator, setIsCreator] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const scanRef = useRef<NodeJS.Timeout | null>(null);

  const fetchGame = useCallback(async () => {
    try {
      const res = await fetch(`/api/morpion/${slug}`);
      if (res.ok) setGame(await res.json());
    } catch {}
    setLoading(false);
  }, [slug]);

  const scanPayments = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    try {
      await fetch(`/api/morpion-scan?gameSlug=${slug}`, { method: "POST" });
      await fetchGame();
    } catch {}
    setScanning(false);
  }, [slug, scanning, fetchGame]);

  useEffect(() => {
    setIsCreator(sessionStorage.getItem(`morpion_creator_${slug}`) === "1");
  }, [slug]);

  useEffect(() => {
    if (!game) return;
    const addresses = [game.player1Address, game.player2Address].filter(Boolean) as string[];
    if (addresses.length === 0) return;
    const unknown = addresses.filter(a => !profiles[a.toLowerCase()]);
    if (unknown.length === 0) return;
    fetch("/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ addresses: unknown }),
    }).then(r => r.json()).then(data => {
      if (data.profiles) setProfiles(prev => ({ ...prev, ...data.profiles }));
    }).catch(() => {});
  }, [game?.player1Address, game?.player2Address]);

  useEffect(() => {
    fetchGame();
    pollRef.current = setInterval(fetchGame, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchGame]);

  useEffect(() => {
    if (!game) return;
    if (game.status === "active" || game.status === "finished") {
      if (scanRef.current) { clearInterval(scanRef.current); scanRef.current = null; }
      return;
    }
    if (!scanRef.current) scanRef.current = setInterval(scanPayments, 5000);
    return () => { if (scanRef.current) { clearInterval(scanRef.current); scanRef.current = null; } };
  }, [game?.status, scanPayments]);

  async function activateTestMode() {
    setTestLoading(true);
    try {
      await fetch(`/api/morpion/${slug}/test`, { method: "POST" });
      setMyAddress("0xTEST000000000000000000000000000000000001");
      setAddressConfirmed(true);
      await fetchGame();
    } catch {}
    setTestLoading(false);
  }

  async function makeMove(position: number) {
    if (!myAddress || !game || game.status !== "active") return;
    setMoveError("");
    const mySymbol = game.player1Address?.toLowerCase() === myAddress.toLowerCase() ? "X" : "O";
    if (game.currentTurn !== mySymbol) { setMoveError(t.notYourTurn[locale]); return; }
    if (game.board[position] !== "-") return;
    try {
      const res = await fetch(`/api/morpion/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerAddress: myAddress, position }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await fetchGame();
    } catch (e: any) { setMoveError(e.message); }
  }

  function copyPaymentLink() {
    if (!game) return;
    const link = generateGamePaymentLink(game.recipientAddress, game.betCrc, "morpion", game.slug);
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function copyGameLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <RefreshCw className="w-6 h-6 text-marine animate-spin" />
    </div>
  );

  if (!game) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <p className="text-ink/50">{locale === "fr" ? "Partie introuvable" : "Game not found"}</p>
      <Link href="/morpion"><Button variant="outline" className="rounded-xl">← {t.back[locale]}</Button></Link>
    </div>
  );

  const mySymbol = myAddress
    ? (game.player1Address?.toLowerCase() === myAddress.toLowerCase() ? "X"
      : game.player2Address?.toLowerCase() === myAddress.toLowerCase() ? "O" : null)
    : null;
  const isMyTurn = mySymbol !== null && game.status === "active" && game.currentTurn === mySymbol;
  const winLine = game.status === "finished" ? getWinLine(game.board) : null;
  const winAmount = Math.floor(game.betCrc * 2 * (1 - game.commissionPct / 100));
  const paymentLink = generateGamePaymentLink(game.recipientAddress, game.betCrc, "morpion", game.slug);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Back + slug */}
        <div className="flex items-center justify-between mb-6">
          <Link href="/morpion" className="inline-flex items-center gap-1.5 text-sm text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" /> {t.back[locale]}
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/40">{t.gameLabel[locale]}</span>
            <span className="font-mono font-bold text-marine text-sm bg-marine/10 px-2.5 py-1 rounded-lg">{game.slug}</span>
          </div>
        </div>

        {/* Status banner */}
        <Card className="mb-4 rounded-xl border-0 shadow-sm bg-white/60 backdrop-blur-sm">
          <CardContent className="p-0 overflow-hidden text-center">
            {game.status === "waiting_p1" && (
              <div className="flex items-center justify-center gap-2 text-ink/60 py-3 px-4">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-semibold">{t.waitingP1[locale]}</span>
              </div>
            )}
            {game.status === "waiting_p2" && (
              <div className="flex items-center justify-center gap-2 text-ink/60 py-3 px-4">
                <Users className="w-4 h-4" />
                <span className="text-sm font-semibold">{t.waitingP2[locale]}</span>
              </div>
            )}
            {game.status === "active" && (
              <div className="flex items-center justify-center gap-2 py-2 px-4">
                <img src={game.currentTurn === "X" ? "/morpion/player1.png" : "/morpion/player2.png"}
                  alt={game.currentTurn} className="w-16 h-16 object-contain" />
                <span className="text-lg font-bold text-ink">
                  {isMyTurn ? t.yourTurn[locale] : `${t.turnOf[locale]} J${game.currentTurn === "X" ? "1" : "2"}`}
                </span>
              </div>
            )}
            {game.status === "finished" && game.result === "draw" && (
              <p className="text-sm font-bold text-ink/70 py-3 px-4">{t.draw[locale]}</p>
            )}
            {game.status === "finished" && game.result !== "draw" && (() => {
              const hasAddress = !!myAddress;
              const iWon = hasAddress && game.winnerAddress?.toLowerCase() === myAddress.toLowerCase();
              const iLost = hasAddress && !iWon;

              if (!hasAddress) return (
                <div className="space-y-1 py-3 px-4">
                  <div className="flex items-center justify-center gap-2">
                    <Trophy className="w-5 h-5 text-citrus" />
                    <span className="font-bold text-ink">{t.gameOver[locale]}</span>
                  </div>
                  <p className="text-xs text-ink/50">{locale === "fr" ? "Gagnant" : "Winner"} : {game.winnerAddress ? (profiles[game.winnerAddress.toLowerCase()]?.name || shortenAddress(game.winnerAddress)) : "—"} — {winAmount} CRC</p>
                </div>
              );

              if (iWon) return (
                <div className="space-y-1 py-3 px-4">
                  <div className="flex items-center justify-center gap-2">
                    <Trophy className="w-5 h-5 text-citrus" />
                    <span className="font-bold text-ink">{t.youWon[locale]}</span>
                  </div>
                  <p className="text-xs text-ink/50">{winAmount} CRC {locale === "fr" ? "en route" : "on the way"}</p>
                </div>
              );

              if (iLost) return (
                <div className="space-y-2 py-3 px-4">
                  <p className="text-2xl text-center">😢</p>
                  <p className="font-bold text-ink text-sm">{t.youLost[locale]}</p>
                  <div className="text-xs text-ink/40 space-y-0.5">
                    <p>{locale === "fr" ? "Gagnant" : "Winner"} : <span className="font-semibold text-ink/60">{game.winnerAddress ? (profiles[game.winnerAddress.toLowerCase()]?.name || shortenAddress(game.winnerAddress)) : "—"}</span></p>
                    <p>{t.betWon[locale]} <span className="font-bold text-ink/60">{winAmount} CRC</span></p>
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Payment section */}
        {(game.status === "waiting_p1" || game.status === "waiting_p2") && (
          <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardContent className="pt-2 px-4 pb-4 space-y-3">
              <div className="flex items-center justify-between gap-3 mb-3">
                <span className="text-xs font-semibold text-ink/40 uppercase tracking-widest">
                  {isCreator ? t.payToStart[locale] : t.payToJoin[locale]}
                </span>
                <span className="text-xs font-bold text-marine bg-marine/10 px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">{game.betCrc} CRC</span>
              </div>
              <a href={paymentLink} target="_blank" rel="noreferrer">
                <Button className="w-full rounded-xl font-bold" style={{ background: "#251B9F" }}>
                  {t.payCrc[locale].replace("{bet}", String(game.betCrc))}
                </Button>
              </a>
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
              <button onClick={scanPayments} disabled={scanning} className="w-full text-xs text-ink/40 hover:text-ink/60 flex items-center justify-center gap-1.5 transition-colors">
                <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
                {scanning ? t.scanningPayments[locale] : t.scanPayments[locale]}
              </button>
            </CardContent>
          </Card>
        )}

        {/* Address input */}
        {game.status === "active" && !addressConfirmed && (
          <Card className="mb-4 bg-white/60 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-semibold text-ink/40 uppercase tracking-widest">{t.yourAddress[locale]}</p>
              <div className="flex gap-2">
                <input type="text" placeholder="0x..." value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-ink/10 bg-white/80 text-ink text-xs font-mono focus:outline-none focus:border-marine/40"
                />
                <Button size="sm" onClick={() => { setMyAddress(addressInput); setAddressConfirmed(true); }}
                  className="rounded-xl px-4 text-xs" style={{ background: "#251B9F" }}>
                  OK
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Board */}
        <Card className="mb-4 bg-white/70 backdrop-blur-sm border-ink/10 shadow-sm rounded-2xl">
          <CardContent className="p-4">
            <div className="grid grid-cols-3 gap-2">
              {game.board.split("").map((cell, i) => {
                const isEmpty = cell === "-";
                const canClick = isEmpty && isMyTurn && game.status === "active";
                const isWinCell = winLine?.includes(i) ?? false;
                const winSymbol = winLine ? game.board[winLine[0]] : null;
                return (
                  <button key={i} onClick={() => canClick && makeMove(i)}
                    className={`aspect-square rounded-xl flex items-center justify-center transition-all border-2 select-none
                      ${isWinCell && winSymbol === "X" ? "border-emerald-400 bg-emerald-100 scale-105" :
                        isWinCell && winSymbol === "O" ? "border-violet-400 bg-violet-100 scale-105" :
                        cell === "X" ? "border-emerald-400/40 bg-emerald-50" :
                        cell === "O" ? "border-violet-400/40 bg-violet-50" :
                        canClick ? "border-ink/10 bg-white hover:border-marine/30 hover:bg-marine/5 cursor-pointer" :
                        "border-ink/5 bg-white/50 cursor-default"}`}
                  >
                    {cell === "X" && <img src="/morpion/player1.png" alt="J1" className="w-full h-full object-contain p-1" />}
                    {cell === "O" && <img src="/morpion/player2.png" alt="J2" className="w-full h-full object-contain p-1" />}
                  </button>
                );
              })}
            </div>
            {moveError && <p className="mt-2 text-xs text-red-500 text-center">{moveError}</p>}
          </CardContent>
        </Card>

        {/* Players */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {[
            { label: "J1", symbol: "X", addr: game.player1Address },
            { label: "J2", symbol: "O", addr: game.player2Address },
          ].map(({ label, symbol, addr }) => {
            const isMe = !!myAddress && addr?.toLowerCase() === myAddress.toLowerCase();
            const profile = addr ? profiles[addr.toLowerCase()] : undefined;
            return (
              <div key={label} className="bg-white/60 backdrop-blur-sm border border-ink/10 rounded-xl p-3">
                <p className="text-[10px] font-bold text-ink/30 uppercase tracking-widest mb-1.5">{label}</p>
                <PlayerBadge addr={addr} profile={profile} symbol={symbol} isMe={isMe} waitingLabel={t.waiting[locale]} youLabel={locale === "fr" ? "vous" : "you"} />
              </div>
            );
          })}
        </div>

        {/* Test mode — dev only */}
        {process.env.NODE_ENV === "development" && (
          <div className="mt-2 p-3 rounded-xl border border-dashed border-ink/15 space-y-2">
            <p className="text-xs text-ink/30 text-center font-mono">🧪 Mode test</p>
            {(game.status === "waiting_p1" || game.status === "waiting_p2") && (
              <button onClick={activateTestMode} disabled={testLoading}
                className="w-full py-1.5 rounded-lg bg-ink/5 text-xs text-ink/40 hover:text-ink/60 hover:bg-ink/10 transition-all">
                {testLoading ? "..." : locale === "fr" ? "Injecter 2 faux joueurs" : "Inject 2 test players"}
              </button>
            )}
            {game.status === "active" && !addressConfirmed && (
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setMyAddress("0xTEST000000000000000000000000000000000001"); setAddressConfirmed(true); }}
                  className="py-1.5 rounded-lg bg-marine/10 text-xs text-marine font-bold hover:bg-marine/20 transition-all">
                  {locale === "fr" ? "Jouer en J1 (X)" : "Play as P1 (X)"}
                </button>
                <button onClick={() => { setMyAddress("0xTEST000000000000000000000000000000000002"); setAddressConfirmed(true); }}
                  className="py-1.5 rounded-lg bg-citrus/10 text-xs text-citrus font-bold hover:bg-citrus/20 transition-all">
                  {locale === "fr" ? "Jouer en J2 (O)" : "Play as P2 (O)"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* My symbol */}
        {mySymbol && game.status === "active" && (
          <p className="text-center text-xs text-ink/40 mt-2">
            {t.youPlay[locale]} <span className="font-bold" style={{ color: mySymbol === "X" ? "#251B9F" : "#FF491B" }}>{mySymbol}</span>
          </p>
        )}
      </div>
    </div>
  );
}
