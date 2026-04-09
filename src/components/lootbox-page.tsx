"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Trophy, Volume2, VolumeX, HelpCircle, X, ChevronDown } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { translations } from "@/lib/i18n";
import { darkSafeColor } from "@/lib/utils";
import { getRewardTable } from "@/lib/lootbox";
import { encodeGameData } from "@/lib/game-data";
import { usePaymentWatcher } from "@/hooks/use-payment-watcher";
import { playRollingSound, playRevealSound, setSoundMuted, isSoundMuted } from "@/lib/sounds";
import { ChancePayment } from "@/components/chance-payment";

type LootboxData = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  pricePerOpenCrc: number;
  recipientAddress: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  status: string;
};

type LootboxOpen = {
  id: number;
  playerAddress: string;
  transactionHash: string;
  rewardCrc: number;
  payoutStatus: string;
  openedAt: string;
};

function shortenAddress(addr: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function getRewardTier(reward: number, price: number): { label: string; color: string; isJackpot: boolean; isMega: boolean; isLegendary: boolean; isRare: boolean } {
  const ratio = reward / price;
  if (ratio >= 7)    return { label: "JACKPOT 🔥",    color: "#F59E0B", isJackpot: true,  isMega: false, isLegendary: false, isRare: false };
  if (ratio >= 3)    return { label: "LEGENDARY ⚡",  color: "#EF4444", isJackpot: false, isMega: false, isLegendary: true,  isRare: false };
  if (ratio >= 1.4)  return { label: "MEGA ✨",        color: "#7C3AED", isJackpot: false, isMega: true,  isLegendary: false, isRare: false };
  if (ratio >= 0.85) return { label: "RARE 😐",        color: "#2563EB", isJackpot: false, isMega: false, isLegendary: false, isRare: true  };
  return { label: "😢",  color: "#6B7280", isJackpot: false, isMega: false, isLegendary: false, isRare: false };
}

const TIER_EMOJIS  = ["😢", "😐", "✨", "⚡", "🔥"];
const TIER_COLORS  = ["#6B7280", "#2563EB", "#7C3AED", "#EF4444", "#F59E0B"];

function RewardTable({ priceCrc, accentColor }: { priceCrc: number; accentColor: string }) {
  const t = translations.lootbox;
  const { locale } = useLocale();
  const table = getRewardTable(priceCrc);
  const rows = table.map((e, i) => ({
    prob: `${Math.round(e.probability * 100)}%`,
    reward: e.reward,
    emoji: TIER_EMOJIS[i],
    color: TIER_COLORS[i],
  }));
  return (
    <div className="w-full rounded-2xl overflow-hidden border border-ink/10 bg-white/60 backdrop-blur-sm shadow-sm">
      <div className="px-4 py-2.5 text-xs font-bold text-ink/40 uppercase tracking-widest bg-ink/[0.03] flex justify-between">
        <span>{t.probability[locale]}</span>
        <span>{t.reward[locale]}</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-3 border-t border-ink/5">
          <span className="text-sm font-semibold text-ink/50">{row.prob}</span>
          <span className="text-sm font-bold" style={{ color: row.color }}>{row.emoji} {row.reward} CRC</span>
        </div>
      ))}
    </div>
  );
}

type AnimPhase = "idle" | "rolling" | "revealing";

const CARD_WIDTH = 140;
const VIEWPORT_WIDTH = 500;
const WINNER_INDEX = 38;
const TOTAL_CARDS = 45;

type SlotCard = { reward: number; tier: ReturnType<typeof getRewardTier> };

function buildRail(winnerReward: number, priceCrc: number): SlotCard[] {
  const table = getRewardTable(priceCrc);
  // Weighted random pick for filler cards
  const pick = (): SlotCard => {
    const r = Math.random();
    let cumul = 0;
    for (const entry of table) {
      cumul += entry.probability;
      if (r < cumul) return { reward: entry.reward, tier: getRewardTier(entry.reward, priceCrc) };
    }
    return { reward: table[0].reward, tier: getRewardTier(table[0].reward, priceCrc) };
  };
  const cards: SlotCard[] = [];
  for (let i = 0; i < TOTAL_CARDS; i++) {
    if (i === WINNER_INDEX) {
      cards.push({ reward: winnerReward, tier: getRewardTier(winnerReward, priceCrc) });
    } else {
      cards.push(pick());
    }
  }
  return cards;
}

const BOX_S = 58;
const BOX_HALF = BOX_S / 2;

function BoxImage({ card, isWinner, isRevealing, isDark }: {
  card: SlotCard; isWinner?: boolean; isRevealing?: boolean; isDark?: boolean;
}) {
  const { tier } = card;
  const [imgError, setImgError] = useState(false);
  const emoji = tier.isJackpot ? "🔥" : tier.isLegendary ? "⚡" : tier.isMega ? "✨" : tier.isRare ? "😐" : "😢";
  const imgSrc = tier.isJackpot ? "/lootbox/jackpot.png"
    : tier.isLegendary ? "/lootbox/legendary.png"
    : tier.isMega ? "/lootbox/mega.png"
    : tier.isRare ? "/lootbox/rare.png"
    : "/lootbox/common.png";
  const glowColor = tier.color || "#9CA3AF";

  return (
    <div style={{ width: CARD_WIDTH - 10, height: 180, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, flexShrink: 0 }}>
      <div style={{
        width: 130, height: 130,
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: isRevealing && isWinner ? "box-winner-bounce 0.6s ease-in-out 3" : undefined,
        transformOrigin: "center center",
      }}>
        {imgError ? (
          <div style={{
            width: 80, height: 80, borderRadius: 12,
            background: `linear-gradient(135deg, ${glowColor}33, ${glowColor}88)`,
            border: `2px solid ${glowColor}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 32,
          }}>{emoji}</div>
        ) : (
          <img
            src={imgSrc}
            alt={tier.label || "common"}
            onError={() => setImgError(true)}
            style={{
              width: 130, height: 130,
              objectFit: "contain",
              filter: isRevealing && isWinner
                ? `drop-shadow(0 0 14px ${glowColor}) drop-shadow(0 0 6px ${glowColor})`
                : undefined,
            }}
          />
        )}
      </div>
      <div style={{ textAlign: "center", lineHeight: 1.2 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: tier.color || (isDark ? "#e5e7eb" : "#374151") }}>{card.reward}</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: tier.color || (isDark ? "#9CA3AF" : "#9CA3AF"), marginLeft: 2 }}>CRC</span>
      </div>
    </div>
  );
}

function SlotMachine({
  phase,
  accentColor,
  primaryColor,
  rewardCrc,
  priceCrc,
  tier,
  animTrigger,
  isDark,
}: {
  phase: AnimPhase;
  accentColor: string;
  primaryColor: string;
  rewardCrc?: number;
  priceCrc: number;
  tier?: ReturnType<typeof getRewardTier> | null;
  animTrigger: number;
  isDark?: boolean;
}) {
  const isJackpotOrMega = tier?.isJackpot || tier?.isMega;
  const isRolling = phase === "rolling";
  const isRevealing = phase === "revealing";
  const isActive = isRolling || isRevealing;

  // Mesure la largeur réelle du conteneur (responsive)
  const containerRef = useRef<HTMLDivElement>(null);
  const [vpWidth, setVpWidth] = useState(500);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    setVpWidth(el.offsetWidth);
    const obs = new ResizeObserver(([entry]) => setVpWidth(entry.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Rail is built once per animation (when rewardCrc changes)
  const cardRailRef = useRef<SlotCard[]>([]);
  const prevReward = useRef<number | undefined>(undefined);
  if (rewardCrc !== undefined && rewardCrc !== prevReward.current) {
    cardRailRef.current = buildRail(rewardCrc, priceCrc);
    prevReward.current = rewardCrc;
  }
  const rail = cardRailRef.current;

  // DOM ref for the rail strip — driven imperatively
  const railDomRef = useRef<HTMLDivElement>(null);

  // finalX via ref pour ne pas relancer l'animation si l'écran est redimensionné
  const ITEM_W = CARD_WIDTH - 10; // 130px
  const GAP = 8;
  const RAIL_PAD = 4;
  const finalXRef = useRef(0);
  finalXRef.current = -(RAIL_PAD + WINNER_INDEX * (ITEM_W + GAP) + ITEM_W / 2 - vpWidth / 2);

  // Trigger CS:GO-style ease-out — animTrigger permet de relancer même si phase="rolling"
  useEffect(() => {
    if (phase !== "rolling") return;
    const el = railDomRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transform = "translateX(0px)";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = "transform 7s cubic-bezier(0.07, 0.9, 0.1, 1.0)";
        el.style.transform = `translateX(${finalXRef.current}px)`;
      });
    });
  }, [phase, animTrigger]);

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <style>{`
        @keyframes winner-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 transparent; }
          50% { transform: scale(1.12); box-shadow: 0 0 24px 6px ${accentColor}66; }
        }
        @keyframes confetti-1 { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-60px,-80px) scale(0);opacity:0} }
        @keyframes confetti-2 { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(60px,-90px) scale(0);opacity:0} }
        @keyframes confetti-3 { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-90px,-30px) scale(0);opacity:0} }
        @keyframes confetti-4 { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(90px,-50px) scale(0);opacity:0} }
        @keyframes confetti-5 { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(-40px,-100px) scale(0);opacity:0} }
        @keyframes confetti-6 { 0%{transform:translate(0,0) scale(1);opacity:1} 100%{transform:translate(50px,-70px) scale(0);opacity:0} }
        @keyframes reward-pop {
          0%   { transform: scale(0) rotate(-8deg); opacity: 0; }
          60%  { transform: scale(1.2) rotate(2deg); opacity: 1; }
          80%  { transform: scale(0.97) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes box-winner-bounce {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.25); }
        }
        @keyframes csgo-indicator-top {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50%       { transform: translateY(-3px); opacity: 0.7; }
        }
        @keyframes csgo-indicator-bottom {
          0%, 100% { transform: translateY(0); opacity: 1; }
          50%       { transform: translateY(3px); opacity: 0.7; }
        }
      `}</style>

      {/* Wrapper — ref pour mesure largeur, triangles ici (hors overflow:hidden) */}
      <div ref={containerRef} className="relative w-full">

        {/* Triangle TOP — pointe vers le bas ▼, collé sur le bord supérieur */}
        <div className="absolute left-1/2 pointer-events-none"
          style={{
            top: 0, zIndex: 30,
            transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "11px solid transparent",
            borderRight: "11px solid transparent",
            borderTop: "13px solid #F59E0B",
            animation: isRolling ? "csgo-indicator-top 0.6s ease-in-out infinite" : undefined,
          }}
        />
        {/* Triangle BOTTOM — pointe vers le haut ▲, collé sur le bord inférieur */}
        <div className="absolute left-1/2 pointer-events-none"
          style={{
            bottom: 0, zIndex: 30,
            transform: "translateX(-50%)",
            width: 0, height: 0,
            borderLeft: "11px solid transparent",
            borderRight: "11px solid transparent",
            borderBottom: "13px solid #F59E0B",
            animation: isRolling ? "csgo-indicator-bottom 0.6s ease-in-out infinite" : undefined,
          }}
        />

        {/* Lignes verticales — hors overflow:hidden, superposées au viewport */}
        <div className="absolute pointer-events-none" style={{
          top: 0, bottom: 0, zIndex: 20,
          left: `calc(50% - ${ITEM_W / 2}px)`,
          width: 2, background: "#F59E0B", opacity: 0.7,
        }} />
        <div className="absolute pointer-events-none" style={{
          top: 0, bottom: 0, zIndex: 20,
          left: `calc(50% + ${ITEM_W / 2 - 2}px)`,
          width: 2, background: "#F59E0B", opacity: 0.7,
        }} />

        {/* Viewport */}
        <div
          className="relative rounded-2xl border-2 overflow-hidden w-full"
          style={{
            height: 190,
            borderColor: isActive ? accentColor : (isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"),
            boxShadow: isActive ? `0 0 32px 4px ${accentColor}33` : (isDark ? "0 4px 16px rgba(0,0,0,0.3)" : "0 4px 16px rgba(0,0,0,0.06)"),
            transition: "border-color 0.3s, box-shadow 0.3s",
            background: isDark ? "#1c1c1e" : "#ffffff",
          }}
        >
          {/* Fade edges */}
          <div className="absolute inset-0 z-10 pointer-events-none" style={{
            background: isDark
              ? "linear-gradient(to right, rgba(28,28,30,0.95) 0%, transparent 18%, transparent 82%, rgba(28,28,30,0.95) 100%)"
              : "linear-gradient(to right, rgba(255,255,255,0.95) 0%, transparent 18%, transparent 82%, rgba(255,255,255,0.95) 100%)"
          }} />

          {/* Rail */}
          {rail.length > 0 && (
            <div
              ref={railDomRef}
              className="absolute top-0 left-0 flex items-center h-full"
              style={{ gap: GAP, paddingLeft: RAIL_PAD, willChange: "transform" }}
            >
              {rail.map((card, i) => (
                <BoxImage
                  key={i}
                  card={card}
                  isWinner={i === WINNER_INDEX}
                  isRevealing={isRevealing}
                  isDark={isDark}
                />
              ))}
            </div>
          )}

          {/* Idle state */}
          {phase === "idle" && rail.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <BoxImage
                card={{ reward: 0, tier: { label: "", color: accentColor, isJackpot: false, isMega: false, isLegendary: false, isRare: false } }}
                isDark={isDark}
              />
            </div>
          )}
        </div>
      </div>

      {/* Reward pop + confetti */}
      {isRevealing && rewardCrc !== undefined && (
        <div className="relative flex flex-col items-center">
          {isJackpotOrMega && (
            <div className="absolute inset-0 pointer-events-none">
              {[1,2,3,4,5,6].map(i => (
                <div key={i} className="absolute left-1/2 top-1/2"
                  style={{
                    width: isJackpotOrMega ? 10 : 6,
                    height: isJackpotOrMega ? 10 : 6,
                    borderRadius: "50%",
                    backgroundColor: i % 3 === 0 ? "#FCD34D" : i % 3 === 1 ? accentColor : "#F472B6",
                    animation: `confetti-${i} ${0.7 + i * 0.1}s ease-out forwards`,
                    animationDelay: `${i * 0.05}s`,
                  }}
                />
              ))}
            </div>
          )}
          <div
            style={{ animation: "reward-pop 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards", opacity: 0 }}
            className="rounded-2xl px-6 py-3 text-center shadow-xl"
          >
            <p className="text-3xl font-black" style={{ color: tier?.color || accentColor }}>
              +{rewardCrc} CRC
            </p>
            {tier?.label && (
              <p className="text-sm font-bold" style={{ color: tier.color }}>{tier.label}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LootboxPageClient({ lootbox }: { lootbox: LootboxData }) {
  const { locale } = useLocale();
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const t = translations.lootbox;

  const [opens, setOpens] = useState<LootboxOpen[]>([]);
  const [scanning, setScanning] = useState(false);
  const [watchingPayment, setWatchingPayment] = useState(false);
  const [showConfirmed, setShowConfirmed] = useState(false);
  const [latestOpen, setLatestOpen] = useState<LootboxOpen | null>(null);
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");
  const [animTrigger, setAnimTrigger] = useState(0);
  const [muted, setMuted] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("lootbox_muted") === "1";
  });
  const [showRules, setShowRules] = useState(false);
  const [showRtp, setShowRtp] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [showRewardTable, setShowRewardTable] = useState(false);
  const [showRecentOpens, setShowRecentOpens] = useState(false);
  const [videoOpen, setVideoOpen] = useState<LootboxOpen | null>(null);
  const [profiles, setProfiles] = useState<Record<string, { name?: string; imageUrl?: string | null }>>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const confirmedTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevOpenCount = useRef<number>(0);
  const profilesRef = useRef<Record<string, { name?: string; imageUrl?: string | null }>>({});
  const animTimers = useRef<NodeJS.Timeout[]>([]);

  const paymentAddress = lootbox.recipientAddress;
  const accentColorRaw = lootbox.accentColor;
  const primaryColor = lootbox.primaryColor;
  const accentColor = darkSafeColor(accentColorRaw, isDark);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
    localStorage.setItem("lootbox_muted", next ? "1" : "0");
  }

  // Sync mute state with sounds lib au montage
  useEffect(() => { setSoundMuted(muted); }, [muted]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  const fetchProfiles = useCallback(async (addresses: string[]) => {
    const normalized = addresses.map(a => a.toLowerCase());
    const needed = normalized.filter(a => !profilesRef.current[a]);
    if (needed.length === 0) return;
    try {
      const res = await fetch("/api/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses: needed }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profiles) {
          const norm: Record<string, { name?: string; imageUrl?: string | null }> = {};
          for (const [addr, prof] of Object.entries(data.profiles)) {
            norm[addr.toLowerCase()] = prof as { name?: string; imageUrl?: string | null };
          }
          setProfiles(prev => ({ ...prev, ...norm }));
        }
      }
    } catch {}
  }, []);

  const clearAnimTimers = useCallback(() => {
    animTimers.current.forEach(t => clearTimeout(t));
    animTimers.current = [];
  }, []);

  const runAnimation = useCallback((open: LootboxOpen) => {
    clearAnimTimers();
    setLatestOpen(open);
    const tier = getRewardTier(open.rewardCrc, lootbox.pricePerOpenCrc);
    playRollingSound();
    setAnimTrigger(t => t + 1);
    setAnimPhase("rolling");
    animTimers.current.push(
      setTimeout(() => {
        setAnimPhase("revealing");
        playRevealSound(tier);
      }, 7200),
      setTimeout(() => setAnimPhase("idle"), 10500),
    );
  }, [clearAnimTimers, lootbox.pricePerOpenCrc]);

  const initialLoadDone = useRef(false);

  const fetchOpens = useCallback(async () => {
    try {
      const res = await fetch(`/api/lootbox-opens?lootboxId=${lootbox.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      const data: LootboxOpen[] = Array.isArray(json) ? json : json.opens ?? [];

      if (!initialLoadDone.current) {
        initialLoadDone.current = true;
        prevOpenCount.current = data.length;
      } else if (data.length > prevOpenCount.current) {
        runAnimation(data[0]);
        prevOpenCount.current = data.length;
      }
      setOpens(data);

      const addresses = [...new Set(data.map(o => o.playerAddress))];
      if (addresses.length > 0) {
        await fetchProfiles(addresses);
      }
    } catch {}
  }, [lootbox.id, fetchProfiles, runAnimation]);

  const scanNow = useCallback(async () => {
    setScanning(true);
    try {
      await fetch(`/api/lootbox-scan?lootboxId=${lootbox.id}`, { method: "POST", cache: "no-store" });
      await fetchOpens();
    } catch {} finally {
      setScanning(false);
    }
  }, [lootbox.id, fetchOpens]);

  const dataValue = useMemo(
    () => encodeGameData({ game: "lootbox", id: lootbox.slug, v: 1 }),
    [lootbox.slug]
  );

  const excludeTxHashes = useMemo(
    () => opens.map(o => o.transactionHash),
    [opens]
  );

  const { status: paymentStatus } = usePaymentWatcher({
    enabled: watchingPayment && lootbox.status === "active",
    dataValue,
    minAmountCRC: lootbox.pricePerOpenCrc,
    recipientAddress: lootbox.recipientAddress,
    excludeTxHashes,
  });

  useEffect(() => {
    if (paymentStatus === "confirmed") {
      setWatchingPayment(false);
      setShowConfirmed(true);
      scanNow();
      if (confirmedTimerRef.current) clearTimeout(confirmedTimerRef.current);
      confirmedTimerRef.current = setTimeout(() => setShowConfirmed(false), 4000);
    }
  }, [paymentStatus, scanNow]);

  useEffect(() => {
    fetchOpens();
    intervalRef.current = setInterval(scanNow, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearAnimTimers();
    };
  }, [fetchOpens, scanNow, clearAnimTimers]);


  const tier = latestOpen ? getRewardTier(latestOpen.rewardCrc, lootbox.pricePerOpenCrc) : null;
  const latestProfile = latestOpen ? profiles[latestOpen.playerAddress.toLowerCase()] : null;

  return (
    <div className="min-h-screen">
      {/* Video overlay for common tier */}
      {showVideo && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
          <video
            src="/videos/lootbox.mp4"
            autoPlay
            playsInline
            style={{ width: 480, maxWidth: "90vw", borderRadius: 16 }}
            onEnded={() => {
              setShowVideo(false);
              setLatestOpen(videoOpen);
              setAnimPhase("revealing");
              playRevealSound({ isJackpot: false, isLegendary: false, isMega: false, isRare: false });
              animTimers.current.push(
                setTimeout(() => setAnimPhase("idle"), 3000)
              );
            }}
          />
          <p className="mt-4 text-white/50 text-sm">Ouverture en cours...</p>
        </div>
      )}
      <main className="px-4 py-10 md:py-16">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
          <div className="flex items-center">
            <Link href="/lootboxes" className="text-sm text-ink/50 hover:text-ink/80 transition-colors font-medium flex items-center gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t.backToLootboxes[locale]}
            </Link>
          </div>

          <header className="space-y-3 text-center">
            <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">{lootbox.title}</h1>
            <p className="text-ink/50 text-sm max-w-md mx-auto">
              {t.autoDesc[locale]
                .replace("{price}", String(lootbox.pricePerOpenCrc))
                .replace("{max}", String(getRewardTable(lootbox.pricePerOpenCrc).at(-1)!.reward))}
            </p>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur-sm border border-ink/10 px-4 py-1.5 shadow-sm">
              <span className="text-xs text-ink/40 font-medium">{t.price[locale]}:</span>
              <span className="text-sm font-bold text-ink">{lootbox.pricePerOpenCrc} CRC</span>
            </div>
          </header>

          <div className="flex flex-col items-center gap-4">
            <SlotMachine
              phase={animPhase}
              accentColor={accentColor}
              primaryColor={primaryColor}
              rewardCrc={latestOpen?.rewardCrc}
              priceCrc={lootbox.pricePerOpenCrc}
              tier={tier}
              animTrigger={animTrigger}
              isDark={isDark}
            />

            {/* Boutons mute + règles */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                title={muted ? t.enableSound[locale] : t.disableSound[locale]}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-ink/10 text-ink/40 hover:text-ink/70 hover:border-ink/20 hover:bg-white/60 transition-all text-xs font-medium"
              >
                {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                {muted ? t.soundOff[locale] : t.soundOn[locale]}
              </button>
              <button
                onClick={() => setShowRules(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-ink/10 text-ink/40 hover:text-ink/70 hover:border-ink/20 hover:bg-white/60 transition-all text-xs font-medium"
              >
                <HelpCircle className="h-3.5 w-3.5" />
                {t.rules[locale]}
              </button>
              <button
                onClick={() => setShowRtp(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-ink/10 text-ink/40 hover:text-ink/70 hover:border-ink/20 hover:bg-white/60 transition-all text-xs font-medium"
              >
                📊 RTP
              </button>
            </div>

            {/* Modal règles */}
            {showRules && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                onClick={() => setShowRules(false)}
              >
                <div
                  className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 border border-ink/10 overflow-y-auto max-h-[85vh]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-ink">{t.rulesTitle[locale]}</h2>
                    <button onClick={() => setShowRules(false)} className="text-ink/30 hover:text-ink transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <ol className="space-y-3 text-sm text-ink/70">
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-marine/10 text-marine text-xs font-bold flex items-center justify-center">1</span>
                      <span>{locale === "fr"
                        ? <>{t.rulesStep1[locale].split("{price}")[0]}<strong className="text-ink">{t.payWithCircles[locale]}</strong>{" "}<strong className="text-ink">{lootbox.pricePerOpenCrc} CRC</strong>{" depuis ton wallet."}</>
                        : <>{<strong className="text-ink">{t.payWithCircles[locale]}</strong>}{" and send exactly "}<strong className="text-ink">{lootbox.pricePerOpenCrc} CRC</strong>{" from your wallet."}</>
                      }</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-marine/10 text-marine text-xs font-bold flex items-center justify-center">2</span>
                      <span>{t.rulesStep2[locale]}</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-marine/10 text-marine text-xs font-bold flex items-center justify-center">3</span>
                      <span>{locale === "fr"
                        ? <>{"La boîte révèle ton gain — de "}<strong className="text-ink">{getRewardTable(lootbox.pricePerOpenCrc)[0].reward} CRC</strong>{" jusqu'à "}<strong className="text-ink">{getRewardTable(lootbox.pricePerOpenCrc).at(-1)!.reward} CRC</strong>{" pour le jackpot !"}</>
                        : <>{"The box reveals your win — from "}<strong className="text-ink">{getRewardTable(lootbox.pricePerOpenCrc)[0].reward} CRC</strong>{" up to "}<strong className="text-ink">{getRewardTable(lootbox.pricePerOpenCrc).at(-1)!.reward} CRC</strong>{" for the jackpot!"}</>
                      }</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-marine/10 text-marine text-xs font-bold flex items-center justify-center">4</span>
                      <span>{locale === "fr"
                        ? <>{"Les CRC gagnés sont envoyés "}<strong className="text-ink">{"automatiquement"}</strong>{" sur ton adresse."}</>
                        : <>{"Your CRC winnings are sent "}<strong className="text-ink">{"automatically"}</strong>{" to your address."}</>
                      }</span>
                    </li>
                  </ol>

                  <div className="rounded-xl bg-ink/[0.03] border border-ink/5 p-3 space-y-2">
                    <p className="text-xs font-bold text-ink/40 uppercase tracking-widest">{t.tierLabel[locale]}</p>
                    {[
                      { label: "😢 Common",     mult: "×0.7–0.85", color: "#6B7280" },
                      { label: "😐 Rare",        mult: "×0.85–1.4", color: "#2563EB" },
                      { label: "✨ Mega",        mult: "×1.4–3",    color: "#7C3AED" },
                      { label: "⚡ Legendary",   mult: "×3–7",      color: "#EF4444" },
                      { label: "🔥 Jackpot",     mult: "×7+",       color: "#F59E0B" },
                    ].map((tier) => (
                      <div key={tier.label} className="flex items-center justify-between text-xs">
                        <span className="font-semibold" style={{ color: tier.color }}>{tier.label}</span>
                        <span className="font-bold text-ink">{tier.mult}</span>
                      </div>
                    ))}
                  </div>

                  <p className="text-xs text-ink/30 text-center">{t.rulesDisclaimer[locale]}</p>
                </div>
              </div>
            )}

            {/* Modal RTP */}
            {showRtp && (() => {
              const table = getRewardTable(lootbox.pricePerOpenCrc);
              const rtp = table.reduce((sum, e) => sum + e.probability * e.reward, 0) / lootbox.pricePerOpenCrc * 100;
              const rtpDisplay = rtp.toFixed(1);
              const isHealthy = rtp >= 95;
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
                  onClick={() => setShowRtp(false)}>
                  <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 border border-ink/10"
                    onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-between">
                      <h2 className="text-lg font-bold text-ink">{t.rtpTitle[locale]}</h2>
                      <button onClick={() => setShowRtp(false)} className="text-ink/30 hover:text-ink transition-colors">
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-center py-3">
                      <span className="text-5xl font-black" style={{ color: isHealthy ? "#10B981" : "#EF4444" }}>{rtpDisplay}%</span>
                    </div>

                    <p className="text-sm text-ink/60 leading-relaxed text-center">
                      {locale === "fr"
                        ? <>{"Pour "}<strong className="text-ink">{"100 CRC"}</strong>{" misés, tu récupères en moyenne "}<strong className="text-ink">{rtpDisplay} CRC</strong>{". Ce chiffre est basé sur les probabilités déclarées par la plateforme."}</>
                        : <>{"For every "}<strong className="text-ink">{"100 CRC"}</strong>{" wagered, you get back on average "}<strong className="text-ink">{rtpDisplay} CRC</strong>{". This figure is based on the probabilities declared by the platform."}</>
                      }
                    </p>

                    <div className="rounded-xl bg-ink/[0.03] border border-ink/5 p-3 space-y-2">
                      <p className="text-xs font-bold text-ink/40 uppercase tracking-widest mb-2">{t.rtpDeclared[locale]}</p>
                      {table.map((e, i) => {
                        const tier = getRewardTier(e.reward, lootbox.pricePerOpenCrc);
                        const contrib = (e.probability * e.reward / lootbox.pricePerOpenCrc * 100).toFixed(1);
                        return (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="font-semibold" style={{ color: tier.color || (isDark ? "#e5e7eb" : "#6B7280") }}>
                              {TIER_EMOJIS[i]} {Math.round(e.probability * 100)}% × {e.reward} CRC
                            </span>
                            <span className="font-bold text-ink/50">= {contrib}%</span>
                          </div>
                        );
                      })}
                      <div className="border-t border-ink/10 pt-2 flex justify-between text-xs font-black">
                        <span className="text-ink">{t.rtpTotal[locale]}</span>
                        <span style={{ color: isHealthy ? "#10B981" : "#EF4444" }}>{rtpDisplay}%</span>
                      </div>
                    </div>

                    <p className="text-xs text-ink/30 text-center">{t.rtpDisclaimer[locale]}</p>
                  </div>
                </div>
              );
            })()}

            {process.env.NODE_ENV === "development" && (
              <div className="flex gap-2 flex-wrap justify-center">
                {[0.7, 0.9, 1.4, 3.0, 7.5].map((mult) => {
                  const reward = Math.round(lootbox.pricePerOpenCrc * mult);
                  return (
                    <button
                      key={mult}
                      onClick={() => runAnimation({ id: 0, playerAddress: "0x0000000000000000000000000000000000000000", transactionHash: "0xtest", rewardCrc: reward, payoutStatus: "pending", openedAt: new Date().toISOString() })}
                      className="text-xs px-3 py-1 rounded-lg border border-dashed border-ink/20 text-ink/40 hover:text-ink/70 hover:border-ink/40 transition-colors"
                    >
                      Test {reward} CRC
                    </button>
                  );
                })}
              </div>
            )}

            {latestOpen && animPhase === "idle" && (
              <div className="text-center">
                {tier?.isJackpot && (
                  <p className="text-2xl font-black animate-bounce" style={{ color: tier.color }}>{tier.label}</p>
                )}
                <p className="text-lg font-bold text-ink">
                  {latestProfile?.name || shortenAddress(latestOpen.playerAddress)} {t.won[locale]}{" "}
                  <span style={{ color: accentColor }}>{latestOpen.rewardCrc} CRC</span>
                </p>
                {tier && tier.label && !tier.isJackpot && (
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: tier.color + "15", color: tier.color }}>
                    {tier.label}
                  </span>
                )}
              </div>
            )}

            {animPhase === "rolling" && (
              <p className="text-sm font-semibold text-ink/50 animate-pulse">
                {t.opening[locale]}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-ink/10 bg-white/60 backdrop-blur-sm p-6 shadow-sm space-y-4">
            <p className="text-ink/50 text-sm text-center">{t.sendInstructions[locale]}</p>

            <ChancePayment
              recipientAddress={lootbox.recipientAddress}
              amountCrc={lootbox.pricePerOpenCrc}
              gameType="lootbox"
              gameId={lootbox.slug}
              accentColor={accentColorRaw}
              payLabel={t.payWithCircles[locale]}
              onPaymentInitiated={async () => { await scanNow(); setWatchingPayment(true); }}
              onScan={scanNow}
              scanning={scanning}
              paymentStatus={showConfirmed ? "confirmed" : watchingPayment ? (paymentStatus === "error" ? "error" : "watching") : "idle"}
              qrLabel={t.scanQr[locale]}
            />

            <p className="text-xs text-ink/25 font-mono break-all text-center">{paymentAddress}</p>
          </div>

          {/* Table des gains — accordéon */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 backdrop-blur-sm shadow-sm overflow-hidden">
            <button
              onClick={() => setShowRewardTable(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-ink/[0.02] transition-colors"
            >
              <span className="text-xs font-bold text-ink/40 uppercase tracking-widest">{t.rewardTable[locale]}</span>
              <ChevronDown className={`h-4 w-4 text-ink/30 transition-transform ${showRewardTable ? "rotate-180" : ""}`} />
            </button>
            {showRewardTable && (
              <div className="border-t border-ink/5">
                <RewardTable priceCrc={lootbox.pricePerOpenCrc} accentColor={accentColor} />
              </div>
            )}
          </div>

          {/* Dernières ouvertures — accordéon */}
          <div className="rounded-2xl border border-ink/10 bg-white/60 backdrop-blur-sm shadow-sm overflow-hidden">
            <button
              onClick={() => setShowRecentOpens(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-ink/[0.02] transition-colors"
            >
              <span className="text-xs font-bold text-ink/40 uppercase tracking-widest flex items-center gap-2">
                <Trophy className="h-3.5 w-3.5" />
                {t.recentOpens[locale]}
              </span>
              <ChevronDown className={`h-4 w-4 text-ink/30 transition-transform ${showRecentOpens ? "rotate-180" : ""}`} />
            </button>
            {showRecentOpens && (
              <div className="border-t border-ink/5 p-4">
                {opens.length === 0 ? (
                  <p className="text-ink/30 text-sm text-center py-4">{t.noOpens[locale]}</p>
                ) : (
                  <div className="space-y-2">
                    {opens.slice(0, 10).map((o) => {
                      const profile = profiles[o.playerAddress.toLowerCase()];
                      const t2 = getRewardTier(o.rewardCrc, lootbox.pricePerOpenCrc);
                      return (
                        <div key={o.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-ink/5 bg-white/50 hover:bg-white/80 transition-colors">
                          {profile?.imageUrl ? (
                            <img src={profile.imageUrl} alt="" className="h-8 w-8 rounded-full flex-shrink-0 object-cover shadow-sm" />
                          ) : (
                            <div className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm" style={{ backgroundColor: accentColorRaw + "18" }}>
                              <span className="text-xs font-bold" style={{ color: accentColor }}>{o.playerAddress.slice(2, 4).toUpperCase()}</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink truncate">{profile?.name || shortenAddress(o.playerAddress)}</p>
                            <p className="text-xs text-ink/30">{new Date(o.openedAt).toLocaleDateString()}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-black" style={{ color: t2.isJackpot ? t2.color : accentColor }}>{o.rewardCrc} CRC</p>
                            {t2.label && (
                              <span className="text-[10px] font-bold" style={{ color: t2.color }}>{t2.label}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
