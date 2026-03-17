"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Loader2, QrCode, Trophy, Zap } from "lucide-react";
import { useLocale, LanguageSwitcher } from "@/components/language-provider";
import { translations } from "@/lib/i18n";
import { getRewardTable } from "@/lib/lootbox";
import { generateGamePaymentLink } from "@/lib/circles";

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

function getRewardTier(reward: number, price: number): { label: string; color: string; isJackpot: boolean; isMega: boolean } {
  const ratio = reward / price;
  if (ratio >= 7) return { label: "JACKPOT 🔥", color: "#EF4444", isJackpot: true, isMega: false };
  if (ratio >= 3) return { label: "MEGA ✨", color: "#7C3AED", isJackpot: false, isMega: true };
  if (ratio >= 1.4) return { label: "RARE 💎", color: "#2563EB", isJackpot: false, isMega: false };
  return { label: "", color: "#6B7280", isJackpot: false, isMega: false };
}

function RewardTable({ priceCrc, accentColor }: { priceCrc: number; accentColor: string }) {
  const t = translations.lootbox;
  const { locale } = useLocale();
  const table = getRewardTable(priceCrc);
  const tiers = ["", "", "💎", "✨", "🔥"];
  const rows = table.map((e, i) => ({
    prob: `${Math.round(e.probability * 100)}%`,
    reward: e.reward,
    tier: tiers[i],
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
          <span className="text-sm font-bold text-ink">{row.tier} {row.reward} CRC</span>
        </div>
      ))}
    </div>
  );
}

type AnimPhase = "idle" | "shaking" | "opening" | "revealing";

function LootboxVisual({
  phase,
  accentColor,
  primaryColor,
  rewardCrc,
  tier,
}: {
  phase: AnimPhase;
  accentColor: string;
  primaryColor: string;
  rewardCrc?: number;
  tier?: ReturnType<typeof getRewardTier> | null;
}) {
  const isShaking = phase === "shaking";
  const isOpening = phase === "opening" || phase === "revealing";
  const isRevealing = phase === "revealing";
  const isJackpotOrMega = tier?.isJackpot || tier?.isMega;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 200, height: 220 }}>
      <style>{`
        @keyframes lootbox-shake {
          0%, 100% { transform: translateX(0) rotate(0deg); }
          10% { transform: translateX(-4px) rotate(-2deg); }
          20% { transform: translateX(4px) rotate(2deg); }
          30% { transform: translateX(-6px) rotate(-3deg); }
          40% { transform: translateX(6px) rotate(3deg); }
          50% { transform: translateX(-8px) rotate(-4deg); }
          60% { transform: translateX(8px) rotate(4deg); }
          70% { transform: translateX(-6px) rotate(-3deg); }
          80% { transform: translateX(6px) rotate(3deg); }
          90% { transform: translateX(-4px) rotate(-2deg); }
        }
        @keyframes lid-fly {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          40% { transform: translateY(-80px) rotate(-25deg); opacity: 1; }
          100% { transform: translateY(-140px) rotate(-45deg); opacity: 0; }
        }
        @keyframes light-burst {
          0% { opacity: 0; transform: scale(0.3); }
          50% { opacity: 1; transform: scale(1.2); }
          100% { opacity: 0.6; transform: scale(1); }
        }
        @keyframes particle-1 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(-50px,-70px) scale(0); opacity:0; } }
        @keyframes particle-2 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(50px,-80px) scale(0); opacity:0; } }
        @keyframes particle-3 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(-70px,-30px) scale(0); opacity:0; } }
        @keyframes particle-4 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(70px,-40px) scale(0); opacity:0; } }
        @keyframes particle-5 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(-30px,-90px) scale(0); opacity:0; } }
        @keyframes particle-6 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(40px,-60px) scale(0); opacity:0; } }
        @keyframes particle-7 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(-60px,-50px) scale(0); opacity:0; } }
        @keyframes particle-8 { 0% { transform: translate(0,0) scale(1); opacity:1; } 100% { transform: translate(60px,-20px) scale(0); opacity:0; } }
        @keyframes reward-pop {
          0% { transform: scale(0) rotate(-10deg); opacity: 0; }
          60% { transform: scale(1.3) rotate(3deg); opacity: 1; }
          80% { transform: scale(0.95) rotate(-1deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .lootbox-idle {
          filter: drop-shadow(0 8px 24px rgba(0,0,0,0.08));
          transition: filter 0.3s, transform 0.3s;
        }
        .lootbox-idle:hover {
          filter: drop-shadow(0 12px 32px rgba(0,0,0,0.14));
          transform: translateY(-2px);
        }
      `}</style>

      <div
        className={!isShaking && !isOpening ? "lootbox-idle" : ""}
        style={{
          animation: isShaking ? "lootbox-shake 0.6s ease-in-out infinite" : undefined,
          filter: isOpening ? `drop-shadow(0 0 30px ${accentColor}88)` : undefined,
        }}
      >
        <svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect x="20" y="80" width="120" height="70" rx="8" fill={primaryColor} />
          <rect x="20" y="80" width="120" height="70" rx="8" fill="url(#boxGrad)" />
          <rect x="70" y="80" width="20" height="70" fill={accentColor} opacity="0.7" />
          <rect x="70" y="80" width="20" height="70" fill="url(#ribbonGrad)" opacity="0.5" />

          <g style={{
            animation: isOpening ? "lid-fly 0.8s ease-out forwards" : undefined,
            transformOrigin: "80px 55px",
          }}>
            <rect x="15" y="55" width="130" height="32" rx="6" fill={accentColor} />
            <rect x="15" y="55" width="130" height="32" rx="6" fill="url(#lidGrad)" />
            <rect x="15" y="65" width="130" height="14" fill={accentColor} opacity="0.7" />
            <rect x="70" y="55" width="20" height="32" fill={accentColor} opacity="0.7" />
            <ellipse cx="55" cy="52" rx="22" ry="14" fill={accentColor} transform="rotate(-20 55 52)" />
            <ellipse cx="105" cy="52" rx="22" ry="14" fill={accentColor} transform="rotate(20 105 52)" />
            <circle cx="80" cy="50" r="10" fill={primaryColor} />
          </g>

          <defs>
            <linearGradient id="boxGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.15" />
              <stop offset="100%" stopColor="black" stopOpacity="0.2" />
            </linearGradient>
            <linearGradient id="lidGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.3" />
              <stop offset="100%" stopColor="black" stopOpacity="0.1" />
            </linearGradient>
            <linearGradient id="ribbonGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="white" stopOpacity="0.4" />
              <stop offset="100%" stopColor="black" stopOpacity="0.1" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {isOpening && (
        <div className="absolute inset-0 pointer-events-none" style={{ top: 40 }}>
          <div
            className="absolute left-1/2 top-0 -translate-x-1/2 rounded-full"
            style={{
              width: 120,
              height: 120,
              background: `radial-gradient(circle, ${accentColor}66 0%, transparent 70%)`,
              animation: "light-burst 0.8s ease-out forwards",
            }}
          />
          {[1,2,3,4,5,6,7,8].map((i) => (
            <div
              key={i}
              className="absolute left-1/2 top-1/4"
              style={{
                width: isJackpotOrMega ? 10 : 6,
                height: isJackpotOrMega ? 10 : 6,
                borderRadius: "50%",
                backgroundColor: i % 3 === 0 ? "#FCD34D" : i % 3 === 1 ? accentColor : "#F472B6",
                animation: `particle-${i} ${0.6 + i * 0.1}s ease-out forwards`,
                animationDelay: `${0.1 + i * 0.05}s`,
              }}
            />
          ))}
        </div>
      )}

      {isRevealing && rewardCrc !== undefined && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ animation: "reward-pop 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards", animationDelay: "0.3s", opacity: 0 }}
        >
          <div
            className="rounded-2xl px-6 py-4 text-center shadow-xl"
            style={{
              background: isJackpotOrMega
                ? `linear-gradient(135deg, ${tier?.color}ee, ${accentColor}ee)`
                : "white",
              border: `2px solid ${tier?.color || accentColor}22`,
              boxShadow: `0 20px 40px -12px ${tier?.color || accentColor}33`,
            }}
          >
            <p className="text-3xl font-black" style={{ color: isJackpotOrMega ? "white" : tier?.color || accentColor }}>
              +{rewardCrc} CRC
            </p>
            {tier?.label && (
              <p className="text-sm font-bold mt-1" style={{ color: isJackpotOrMega ? "#FCD34D" : tier.color }}>
                {tier.label}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function LootboxPageClient({ lootbox }: { lootbox: LootboxData }) {
  const { locale } = useLocale();
  const t = translations.lootbox;

  const [opens, setOpens] = useState<LootboxOpen[]>([]);
  const [scanning, setScanning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrCode, setQrCode] = useState<string>("");
  const [qrState, setQrState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [latestOpen, setLatestOpen] = useState<LootboxOpen | null>(null);
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");
  const [profiles, setProfiles] = useState<Record<string, { name?: string; imageUrl?: string | null }>>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevOpenCount = useRef<number>(0);
  const profilesRef = useRef<Record<string, { name?: string; imageUrl?: string | null }>>({});
  const animTimers = useRef<NodeJS.Timeout[]>([]);

  const paymentAddress = lootbox.recipientAddress;
  const paymentLink = useMemo(
    () => generateGamePaymentLink(lootbox.recipientAddress, lootbox.pricePerOpenCrc, "lootbox", lootbox.slug),
    [lootbox.recipientAddress, lootbox.pricePerOpenCrc, lootbox.slug]
  );
  const { primaryColor, accentColor } = lootbox;

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
    setAnimPhase("shaking");
    animTimers.current.push(
      setTimeout(() => setAnimPhase("opening"), 1200),
      setTimeout(() => setAnimPhase("revealing"), 2000),
      setTimeout(() => setAnimPhase("idle"), 5000),
    );
  }, [clearAnimTimers]);

  const initialLoadDone = useRef(false);

  const fetchOpens = useCallback(async () => {
    try {
      const res = await fetch(`/api/lootbox-opens?lootboxId=${lootbox.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: LootboxOpen[] = await res.json();

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

  useEffect(() => {
    fetchOpens();
    intervalRef.current = setInterval(scanNow, 10000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearAnimTimers();
    };
  }, [fetchOpens, scanNow, clearAnimTimers]);

  useEffect(() => {
    if (!showQr) return;
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
  }, [showQr, paymentLink]);

  function handleCopy() {
    navigator.clipboard.writeText(paymentLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const tier = latestOpen ? getRewardTier(latestOpen.rewardCrc, lootbox.pricePerOpenCrc) : null;
  const latestProfile = latestOpen ? profiles[latestOpen.playerAddress.toLowerCase()] : null;

  return (
    <div className="min-h-screen">
      <main className="px-4 py-10 md:py-16">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
          <div className="flex items-center justify-between">
            <Link href="/lootboxes" className="text-sm text-ink/50 hover:text-ink/80 transition-colors font-medium flex items-center gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" />
              {t.backToLootboxes[locale]}
            </Link>
            <LanguageSwitcher />
          </div>

          <header className="space-y-3 text-center">
            <h1 className="font-display text-4xl font-bold text-ink sm:text-5xl">{lootbox.title}</h1>
            {lootbox.description && <p className="text-ink/50 text-sm max-w-md mx-auto">{lootbox.description}</p>}
            <div className="inline-flex items-center gap-2 rounded-full bg-white/70 backdrop-blur-sm border border-ink/10 px-4 py-1.5 shadow-sm">
              <span className="text-xs text-ink/40 font-medium">{t.price[locale]}:</span>
              <span className="text-sm font-bold text-ink">{lootbox.pricePerOpenCrc} CRC</span>
            </div>
          </header>

          <div className="flex flex-col items-center gap-4">
            <LootboxVisual
              phase={animPhase}
              accentColor={accentColor}
              primaryColor={primaryColor}
              rewardCrc={latestOpen?.rewardCrc}
              tier={tier}
            />

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

            {animPhase === "shaking" && (
              <p className="text-sm font-semibold text-ink/50 animate-pulse">
                {locale === "fr" ? "Ouverture en cours..." : "Opening..."}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-ink/10 bg-white/60 backdrop-blur-sm p-6 shadow-sm space-y-4">
            <p className="text-ink/50 text-sm text-center">{t.sendInstructions[locale]}</p>

            <a
              href={paymentLink}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all hover:opacity-90 shadow-sm w-full"
              style={{ backgroundColor: accentColor }}
            >
              {locale === "fr" ? "Payer avec Circles" : "Pay with Circles"}
            </a>

            <div className="flex gap-3 w-full">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-ink/15 text-ink/60 hover:text-ink hover:border-ink/30 hover:bg-white/80 transition-all text-sm font-medium"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t.copied[locale] : (locale === "fr" ? "Copier le lien" : "Copy link")}
              </button>
              <button
                onClick={() => setShowQr(!showQr)}
                className="px-4 py-3 rounded-xl border border-ink/15 text-ink/50 hover:text-ink hover:border-ink/30 hover:bg-white/80 transition-all"
              >
                <QrCode className="h-5 w-5" />
              </button>
              <button
                onClick={scanNow}
                disabled={scanning}
                className="px-4 py-3 rounded-xl border border-ink/15 text-ink/50 hover:text-ink hover:border-ink/30 hover:bg-white/80 transition-all disabled:opacity-40"
              >
                {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
              </button>
            </div>

            {scanning && (
              <p className="text-xs text-ink/40 animate-pulse text-center">
                {locale === "fr" ? "Recherche de paiement..." : "Scanning for payment..."}
              </p>
            )}

            <p className="text-xs text-ink/25 font-mono break-all text-center">{paymentAddress}</p>

            {showQr && (
              <div className="flex justify-center">
                <div className="bg-white rounded-2xl p-4 shadow-lg border border-ink/5">
                  {qrState === "loading" && (
                    <div className="w-[220px] h-[220px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-ink/20" />
                    </div>
                  )}
                  {qrState === "ready" && qrCode && <img src={qrCode} alt="QR Code" className="w-[220px] h-[220px]" />}
                  {qrState === "error" && (
                    <div className="w-[220px] h-[220px] flex items-center justify-center text-xs text-red-400">Error</div>
                  )}
                  <p className="text-xs text-ink/40 mt-2 text-center">{t.scanQr[locale]}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <h3 className="text-ink/40 text-xs font-bold uppercase tracking-widest mb-3 text-center">{t.rewardTable[locale]}</h3>
            <RewardTable priceCrc={lootbox.pricePerOpenCrc} accentColor={accentColor} />
          </div>

          <div className="rounded-2xl border border-ink/10 bg-white/60 backdrop-blur-sm p-6 shadow-sm">
            <h3 className="text-ink/40 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
              <Trophy className="h-3.5 w-3.5" />
              {t.recentOpens[locale]}
            </h3>
            {opens.length === 0 ? (
              <p className="text-ink/30 text-sm text-center py-6">{t.noOpens[locale]}</p>
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
                        <div className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-sm" style={{ backgroundColor: accentColor + "18" }}>
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
        </div>
      </main>
    </div>
  );
}
