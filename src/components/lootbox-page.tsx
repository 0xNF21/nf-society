"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, Copy, Check, Loader2, QrCode, Trophy, Zap, Star } from "lucide-react";
import { useLocale, LanguageSwitcher } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

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

function getRewardTier(reward: number, price: number): { label: string; color: string; isJackpot: boolean } {
  const ratio = reward / price;
  if (ratio >= 7) return { label: "JACKPOT 🔥", color: "#EF4444", isJackpot: true };
  if (ratio >= 3) return { label: "RARE ✨", color: "#A855F7", isJackpot: false };
  if (ratio >= 1.4) return { label: "GOOD 💎", color: "#3B82F6", isJackpot: false };
  return { label: "", color: "#6B7280", isJackpot: false };
}

// Reward table display
function RewardTable({ priceCrc, accentColor }: { priceCrc: number; accentColor: string }) {
  const t = translations.lootbox;
  const { locale } = useLocale();
  const rows = [
    { prob: "60%", reward: Math.round(priceCrc * 0.7), tier: "" },
    { prob: "25%", reward: Math.round(priceCrc * 0.9), tier: "" },
    { prob: "10%", reward: Math.round(priceCrc * 1.4), tier: "💎" },
    { prob: "4%",  reward: Math.round(priceCrc * 3.0), tier: "✨" },
    { prob: "1%",  reward: Math.round(priceCrc * 7.0), tier: "🔥" },
  ];
  return (
    <div className="w-full rounded-2xl overflow-hidden border border-white/10">
      <div className="px-4 py-2 text-xs font-bold text-white/50 uppercase tracking-widest bg-white/5 flex justify-between">
        <span>{t.probability[locale]}</span>
        <span>{t.reward[locale]}</span>
      </div>
      {rows.map((row, i) => (
        <div key={i} className="flex items-center justify-between px-4 py-2.5 border-t border-white/5">
          <span className="text-sm font-semibold text-white/60">{row.prob}</span>
          <span className="text-sm font-bold text-white">{row.tier} {row.reward} CRC</span>
        </div>
      ))}
    </div>
  );
}

// Animated lootbox visual
function LootboxVisual({ isOpening, accentColor, primaryColor }: { isOpening: boolean; accentColor: string; primaryColor: string }) {
  return (
    <div
      className={`relative flex items-center justify-center transition-all duration-700 ${isOpening ? "scale-125 rotate-12" : "scale-100 rotate-0"}`}
      style={{ filter: isOpening ? `drop-shadow(0 0 40px ${accentColor}cc)` : `drop-shadow(0 0 12px ${accentColor}55)` }}
    >
      <svg width="160" height="160" viewBox="0 0 160 160" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Box bottom */}
        <rect x="20" y="80" width="120" height="70" rx="8" fill={primaryColor} />
        <rect x="20" y="80" width="120" height="70" rx="8" fill="url(#boxGrad)" />
        {/* Box lid */}
        <rect x="15" y="55" width="130" height="32" rx="6" fill={accentColor} />
        <rect x="15" y="55" width="130" height="32" rx="6" fill="url(#lidGrad)" />
        {/* Ribbon vertical */}
        <rect x="70" y="55" width="20" height="95" fill={accentColor} opacity="0.7" />
        <rect x="70" y="55" width="20" height="95" fill="url(#ribbonGrad)" opacity="0.5" />
        {/* Ribbon horizontal */}
        <rect x="15" y="65" width="130" height="14" fill={accentColor} opacity="0.7" />
        {/* Bow */}
        <ellipse cx="55" cy="52" rx="22" ry="14" fill={accentColor} transform="rotate(-20 55 52)" />
        <ellipse cx="105" cy="52" rx="22" ry="14" fill={accentColor} transform="rotate(20 105 52)" />
        <circle cx="80" cy="50" r="10" fill={primaryColor} />
        {/* Stars sparkle when opening */}
        {isOpening && (
          <>
            <circle cx="30" cy="30" r="4" fill="#FCD34D" className="animate-ping" />
            <circle cx="130" cy="25" r="3" fill="#FCD34D" className="animate-ping" style={{ animationDelay: "0.2s" }} />
            <circle cx="140" cy="80" r="3" fill="#FCD34D" className="animate-ping" style={{ animationDelay: "0.4s" }} />
            <circle cx="20" cy="110" r="4" fill="#FCD34D" className="animate-ping" style={{ animationDelay: "0.1s" }} />
          </>
        )}
        {/* Gradients */}
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
  const [isOpening, setIsOpening] = useState(false);
  const [profiles, setProfiles] = useState<Record<string, { name?: string; imageUrl?: string | null }>>({});
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const prevOpenCount = useRef<number>(0);

  const paymentAddress = lootbox.recipientAddress;
  const { primaryColor, accentColor } = lootbox;

  useEffect(() => {
    // Set CSS variables for theming
    document.documentElement.style.setProperty("--primary", primaryColor);
    document.documentElement.style.setProperty("--accent", accentColor);
    return () => {
      document.documentElement.style.removeProperty("--primary");
      document.documentElement.style.removeProperty("--accent");
    };
  }, [primaryColor, accentColor]);

  async function fetchOpens() {
    try {
      const res = await fetch(`/api/lootbox-opens?lootboxId=${lootbox.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const data: LootboxOpen[] = await res.json();
      if (data.length > prevOpenCount.current && prevOpenCount.current > 0) {
        const newest = data[0];
        setLatestOpen(newest);
        setIsOpening(true);
        setTimeout(() => setIsOpening(false), 1500);
      }
      prevOpenCount.current = data.length;
      setOpens(data);

      // Fetch profiles for new addresses
      const addresses = [...new Set(data.map((o) => o.playerAddress))];
      const newAddresses = addresses.filter((a) => !profiles[a]);
      if (newAddresses.length > 0) {
        try {
          const res2 = await fetch("/api/profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: newAddresses }),
          });
          if (res2.ok) {
            const profileData = await res2.json();
            setProfiles((prev) => ({ ...prev, ...profileData }));
          }
        } catch {}
      }
    } catch {}
  }

  async function scanNow() {
    setScanning(true);
    try {
      await fetch(`/api/lootbox-scan?lootboxId=${lootbox.id}`, { method: "POST", cache: "no-store" });
      await fetchOpens();
    } catch {} finally {
      setScanning(false);
    }
  }

  useEffect(() => {
    fetchOpens();
    // Auto-scan every 30 seconds
    intervalRef.current = setInterval(scanNow, 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    if (!showQr) return;
    let active = true;
    setQrState("loading");
    (async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const url = await toDataURL(paymentAddress, { width: 220, margin: 1, color: { dark: primaryColor, light: "#ffffff" } });
        if (active) { setQrCode(url); setQrState("ready"); }
      } catch {
        if (active) { setQrCode(""); setQrState("error"); }
      }
    })();
    return () => { active = false; };
  }, [showQr, paymentAddress, primaryColor]);

  function handleCopy() {
    navigator.clipboard.writeText(paymentAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const tier = latestOpen ? getRewardTier(latestOpen.rewardCrc, lootbox.pricePerOpenCrc) : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: `linear-gradient(135deg, ${primaryColor}22 0%, #0f172a 50%, ${accentColor}11 100%)`, backgroundColor: "#0f172a" }}>
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md border-b border-white/10 px-4 py-3 flex items-center justify-between" style={{ backgroundColor: `${primaryColor}33` }}>
        <Link href="/lootboxes" className="flex items-center gap-2 text-white/70 hover:text-white transition-colors text-sm font-medium">
          <ArrowLeft className="h-4 w-4" />
          <span>{t.backToLootboxes[locale]}</span>
        </Link>
        <LanguageSwitcher />
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-10 gap-8">
        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="font-display text-3xl font-black text-white">{lootbox.title}</h1>
          {lootbox.description && <p className="text-white/50 text-sm max-w-md">{lootbox.description}</p>}
          <p className="text-white/40 text-xs font-mono">{t.price[locale]}: <span className="text-white font-bold">{lootbox.pricePerOpenCrc} CRC</span></p>
        </div>

        {/* Lootbox visual + result */}
        <div className="relative flex flex-col items-center gap-4">
          <LootboxVisual isOpening={isOpening} accentColor={accentColor} primaryColor={primaryColor} />

          {/* Result overlay */}
          {latestOpen && (
            <div
              className={`text-center transition-all duration-500 ${isOpening ? "opacity-100 scale-110" : "opacity-100 scale-100"}`}
            >
              {tier?.isJackpot && (
                <p className="text-2xl font-black animate-bounce" style={{ color: tier.color }}>{tier.label}</p>
              )}
              <p className="text-lg font-black text-white">
                {shortenAddress(latestOpen.playerAddress)} {t.won[locale]}{" "}
                <span style={{ color: accentColor }}>{latestOpen.rewardCrc} CRC</span>
              </p>
              {tier && tier.label && !tier.isJackpot && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: tier.color + "33", color: tier.color }}>
                  {tier.label}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Price + action */}
        <div className="w-full max-w-sm flex flex-col items-center gap-4">
          <p className="text-white/60 text-sm text-center">{t.sendInstructions[locale]}</p>

          <div className="flex gap-3 w-full">
            <button
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-colors"
              style={{ backgroundColor: accentColor, color: "#0f172a" }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? t.copied[locale] : t.copyAddress[locale]}
            </button>
            <button
              onClick={() => setShowQr(!showQr)}
              className="px-4 py-3 rounded-2xl border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors"
            >
              <QrCode className="h-5 w-5" />
            </button>
            <button
              onClick={scanNow}
              disabled={scanning}
              className="px-4 py-3 rounded-2xl border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors disabled:opacity-40"
            >
              {scanning ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
            </button>
          </div>

          <p className="text-xs text-white/30 font-mono break-all text-center">{paymentAddress}</p>

          {/* QR Code */}
          {showQr && (
            <div className="bg-white rounded-2xl p-4 shadow-xl">
              {qrState === "loading" && (
                <div className="w-[220px] h-[220px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                </div>
              )}
              {qrState === "ready" && qrCode && <img src={qrCode} alt="QR Code" className="w-[220px] h-[220px]" />}
              {qrState === "error" && (
                <div className="w-[220px] h-[220px] flex items-center justify-center text-xs text-red-400">Error</div>
              )}
              <p className="text-xs text-gray-500 mt-2 text-center">{t.scanQr[locale]}</p>
            </div>
          )}
        </div>

        {/* Reward table */}
        <div className="w-full max-w-sm">
          <h3 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3 text-center">{t.rewardTable[locale]}</h3>
          <RewardTable priceCrc={lootbox.pricePerOpenCrc} accentColor={accentColor} />
        </div>

        {/* Recent opens */}
        <div className="w-full max-w-sm">
          <h3 className="text-white/50 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
            <Trophy className="h-3.5 w-3.5" />
            {t.recentOpens[locale]}
          </h3>
          {opens.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-6">{t.noOpens[locale]}</p>
          ) : (
            <div className="space-y-2">
              {opens.slice(0, 10).map((o) => {
                const profile = profiles[o.playerAddress];
                const t2 = getRewardTier(o.rewardCrc, lootbox.pricePerOpenCrc);
                return (
                  <div key={o.id} className="flex items-center gap-3 py-2.5 px-3 rounded-xl border border-white/10 bg-white/5">
                    {profile?.imageUrl ? (
                      <img src={profile.imageUrl} alt="" className="h-8 w-8 rounded-full flex-shrink-0 object-cover" />
                    ) : (
                      <div className="h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: accentColor + "33" }}>
                        <span className="text-xs font-bold" style={{ color: accentColor }}>{o.playerAddress.slice(2, 4).toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{profile?.name || shortenAddress(o.playerAddress)}</p>
                      <p className="text-xs text-white/40">{new Date(o.openedAt).toLocaleDateString()}</p>
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
      </main>
    </div>
  );
}
