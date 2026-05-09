"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, ShoppingBag, Lock, Check, Zap, Shield, Sparkles, Coins, Gamepad2, Loader2 } from "lucide-react";
import { useLocale } from "@/components/language-provider";
import { useDemo } from "@/components/demo-provider";
import { translations } from "@/lib/i18n";
import { useAuthSession } from "@/components/auth-provider";
import { useFeatureFlags } from "@/components/feature-flag-provider";

type ShopItem = {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  fragmentsCost?: number;
  levelRequired: number;
  refundType: string | null;
  refundAmountCrc: number | null;
  stock: number | null;
  active: boolean;
  status?: string;
  activeUntil?: string | null;
};

type PlayerInfo = {
  address: string;
  xp: number;
  fragmentsSpent?: number;
  level: number;
} | null;

type AuthState = "idle" | "confirmed";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  game: <Gamepad2 className="w-4 h-4" />,
  boost: <Zap className="w-4 h-4" />,
  protection: <Shield className="w-4 h-4" />,
  cosmetic: <Sparkles className="w-4 h-4" />,
  crc: <Coins className="w-4 h-4" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  game: "bg-amber-100 text-amber-700 border-amber-200",
  boost: "bg-violet-100 text-violet-700 border-violet-200",
  protection: "bg-emerald-100 text-emerald-700 border-emerald-200",
  cosmetic: "bg-pink-100 text-pink-700 border-pink-200",
  crc: "bg-sky-100 text-sky-700 border-sky-200",
};

const ITEM_ICONS: Record<string, string> = {
  gift: "\u{1F381}", diamond: "\u{1F48E}", slot: "\u{1F3B0}", package: "\u{1F4E6}",
  zap: "\u26A1", battery: "\u{1F50B}", "trending-down": "\u{1F4C9}", "bar-chart": "\u{1F4CA}",
  crown: "\u{1F451}", trophy: "\u{1F3C6}", shield: "\u{1F6E1}\uFE0F",
  "award-silver": "\u{1F948}", "award-gold": "\u{1F947}", "award-diamond": "\u{1F4A0}",
  edit: "\u270F\uFE0F", landmark: "\u{1F3DB}\uFE0F", coin: "\u{1FA99}", coins: "\u{1F4B0}", gem: "\u{1F48E}",
};

const DEMO_ITEMS: ShopItem[] = [
  { id: 1, slug: "lootbox_refund", name: "Lootbox RemboursÃ©e", description: "Paie 10 CRC, remboursÃ© automatiquement", icon: "gift", category: "game", fragmentsCost: 500, levelRequired: 1, refundType: "lootbox_refund", refundAmountCrc: 10, stock: null, active: true, status: "available" },
  { id: 2, slug: "lootbox_rare_refund", name: "Lootbox Rare RemboursÃ©e", description: "Paie 10 CRC, remboursÃ© + Rare garanti", icon: "diamond", category: "game", fragmentsCost: 2000, levelRequired: 4, refundType: "lootbox_rare_refund", refundAmountCrc: 10, stock: null, active: true, status: "available" },
  { id: 3, slug: "xp_boost_24h", name: "Boost XP 24h", description: "XP x2 pendant 24h", icon: "zap", category: "boost", fragmentsCost: 300, levelRequired: 2, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 4, slug: "xp_boost_7d", name: "Boost XP 7 jours", description: "XP x1.5 pendant 7 jours", icon: "battery", category: "boost", fragmentsCost: 1500, levelRequired: 4, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 5, slug: "commission_reduction_7d", name: "Commission -2%", description: "Commission rÃ©duite de 2% pendant 7 jours", icon: "trending-down", category: "boost", fragmentsCost: 800, levelRequired: 3, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 6, slug: "commission_reduction_30d", name: "Commission -3%", description: "Commission rÃ©duite de 3% pendant 30 jours", icon: "bar-chart", category: "boost", fragmentsCost: 2500, levelRequired: 6, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 7, slug: "vip_access_7d", name: "AccÃ¨s VIP 7 jours", description: "Tables VIP + tournois exclusifs", icon: "crown", category: "boost", fragmentsCost: 3000, levelRequired: 5, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 8, slug: "vip_access_30d", name: "AccÃ¨s VIP 30 jours", description: "Tables VIP + tournois exclusifs", icon: "trophy", category: "boost", fragmentsCost: 8000, levelRequired: 7, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 9, slug: "streak_shield", name: "Bouclier de Streak", description: "Protege ton streak une fois", icon: "shield", category: "protection", fragmentsCost: 400, levelRequired: 2, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 10, slug: "streak_shield_3", name: "Pack Boucliers x3", description: "Protege ton streak 3 fois", icon: "shield", category: "protection", fragmentsCost: 1000, levelRequired: 3, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 11, slug: "badge_silver", name: "Badge Argent", description: "Badge argentÃ© sur ton profil", icon: "award-silver", category: "cosmetic", fragmentsCost: 500, levelRequired: 2, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 12, slug: "badge_gold", name: "Badge Or", description: "Badge dorÃ© sur ton profil", icon: "award-gold", category: "cosmetic", fragmentsCost: 2000, levelRequired: 5, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 13, slug: "badge_diamond", name: "Badge Diamant", description: "Badge diamant exclusif", icon: "award-diamond", category: "cosmetic", fragmentsCost: 5000, levelRequired: 8, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 14, slug: "custom_title", name: "Titre PersonnalisÃ©", description: "Choisis ton propre titre affichÃ©", icon: "edit", category: "cosmetic", fragmentsCost: 3000, levelRequired: 6, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 15, slug: "hall_of_fame", name: "Hall of Fame", description: "Ton nom gravÃ© pour toujours", icon: "landmark", category: "cosmetic", fragmentsCost: 10000, levelRequired: 9, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 16, slug: "crc_1", name: "1 CRC", description: "Echange Fragments contre CRC", icon: "coin", category: "crc", fragmentsCost: 150, levelRequired: 1, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 17, slug: "crc_5", name: "5 CRC", description: "Echange Fragments contre CRC", icon: "coins", category: "crc", fragmentsCost: 650, levelRequired: 3, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 18, slug: "crc_10", name: "10 CRC", description: "Echange Fragments contre CRC", icon: "gem", category: "crc", fragmentsCost: 1200, levelRequired: 5, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
  { id: 19, slug: "crc_25", name: "25 CRC", description: "Echange Fragments contre CRC", icon: "crown", category: "crc", fragmentsCost: 2800, levelRequired: 7, refundType: null, refundAmountCrc: null, stock: null, active: true, status: "available" },
];

export default function ShopPage() {
  const { locale } = useLocale();
  const { isDemo, demoPlayer, spendFragments } = useDemo();
  const { address: sessionAddress, loading: authLoading, openLogin } = useAuthSession();
  const { flagStatus, loading: flagsLoading } = useFeatureFlags();
  // Fail-closed : F2P par defaut sauf si real_stakes explicitement "enabled".
  // Voir wallet-balance-card.tsx pour le contexte (PR #45 + UI fail-closed).
  const realStakesDisabled = flagsLoading || flagStatus("real_stakes") !== "enabled";
  const t = translations.shop;

  // Auth state
  const [authState, setAuthState] = useState<AuthState>("idle");

  // Shop state
  const [items, setItems] = useState<ShopItem[]>([]);
  const [player, setPlayer] = useState<PlayerInfo>(null);
  const [fragmentsBalance, setFragmentsBalance] = useState(0);
  const [category, setCategory] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [buying, setBuying] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [verifiedAddress, setVerifiedAddress] = useState<string | null>(null);
  const demo = isDemo;
  const getItemFragmentsCost = (item: ShopItem) => item.fragmentsCost ?? 0;

  // Sync demo player data reactively
  useEffect(() => {
    if (isDemo) {
      setPlayer({ address: demoPlayer.address, xp: demoPlayer.xp, fragmentsSpent: demoPlayer.fragmentsSpent, level: demoPlayer.level });
      setFragmentsBalance(demoPlayer.fragmentsBalance);
      setAuthState("confirmed");
      setItems(prev => prev.length > 0 ? prev : DEMO_ITEMS);
      setLoading(false);
      return;
    }
    if (authLoading) {
      setLoading(true);
      return;
    }

    // Server auth session is the source of truth. The Mini App wallet address
    // is only a hint until the signed auth flow creates the HttpOnly cookie.
    if (sessionAddress) {
      setVerifiedAddress(sessionAddress);
      setAuthState("confirmed");
      setLoading(false);
      return;
    }

    try { localStorage.removeItem("nf-shop-session"); } catch {}
    setVerifiedAddress(null);
    setAuthState("idle");
    setLoading(false);
  }, [authLoading, demoPlayer, isDemo, sessionAddress]);

  const fetchShop = useCallback(async (address?: string) => {
    try {
      const addr = address || verifiedAddress;
      const url = addr ? `/api/shop?address=${addr}` : `/api/shop`;
      const res = await fetch(url);
      const data = await res.json();
      if (res.status === 401 || data?.error === "AUTH_REQUIRED") {
        setAuthState("idle");
        setVerifiedAddress(null);
        setPlayer(null);
        setFragmentsBalance(0);
        return;
      }
      setItems(data.items || []);
      setPlayer(data.player || null);
      setFragmentsBalance(data.fragmentsBalance ?? 0);
    } catch (err) {
      console.error("Failed to fetch shop:", err);
    }
  }, [verifiedAddress]);

  // Load shop when verified (skip for demo â€” enableDemo handles state)
  useEffect(() => {
    if (authState === "confirmed" && verifiedAddress && !demo) {
      fetchShop(verifiedAddress);
    }
  }, [authState, verifiedAddress, demo, fetchShop]);

  const startAuth = () => openLogin();

  const { enterDemo: enableDemo } = useDemo();

  const handleBuy = async (slug: string) => {
    if (!player && !demo) return;

    if (demo) {
      const item = items.find(i => i.slug === slug);
      if (!item) return;
      const cost = getItemFragmentsCost(item);
      const ok = spendFragments(cost);
      if (!ok) return;
      setSuccess(slug);
      setConfirm(null);
      setFragmentsBalance(prev => prev - cost);
      setItems(prev => prev.map(i =>
        i.slug === slug
          ? { ...i, status: i.category === "cosmetic" ? "owned" : "active" }
          : i
      ));
      setTimeout(() => setSuccess(null), 2000);
      return;
    }

    setBuying(slug);
    try {
      const res = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_slug: slug }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccess(slug);
        setConfirm(null);
        setFragmentsBalance(data.fragmentsRemaining ?? 0);
        await fetchShop();
        setTimeout(() => setSuccess(null), 2000);
      } else if (res.status === 401 || data?.error === "AUTH_REQUIRED") {
        setAuthState("idle");
        setVerifiedAddress(null);
        openLogin();
      } else {
        alert(data.error || "Erreur");
      }
    } catch (err) {
      console.error("Buy error:", err);
    } finally {
      setBuying(null);
    }
  };

  const categories = realStakesDisabled
    ? ["all", "boost", "protection", "cosmetic"]
    : ["all", "game", "boost", "protection", "cosmetic", "crc"];
  const catLabels: Record<string, string> = {
    all: t.allCategories[locale],
    game: t.catGame[locale],
    boost: t.catBoost[locale],
    protection: t.catProtection[locale],
    cosmetic: t.catCosmetic[locale],
    crc: t.catCrc[locale],
  };

  // En mode Free-to-Play :
  //   - la categorie "crc" (echange Fragments -> CRC) est masquee (plus d'emission CRC)
  //   - les items "refund" (dont le nom/desc mentionne un paiement CRC) sont filtres
  //     car les jeux ne coutent plus de CRC
  const visibleItems = realStakesDisabled
    ? items.filter((i) => i.active !== false && i.category !== "crc" && !i.refundType)
    : items.filter((i) => i.active !== false);

  const filtered = category === "all"
    ? visibleItems
    : visibleItems.filter(i => i.category === category);

  const getStatusButton = (item: ShopItem) => {
    const status = item.status || "available";

    if (success === item.slug) {
      return (
        <span className="flex items-center gap-1 text-emerald-600 font-bold text-sm">
          <Check className="w-4 h-4" /> {t.purchased[locale]}
        </span>
      );
    }

    if (status === "owned") {
      return <span className="text-xs font-medium text-pink-600 bg-pink-50 px-2 py-1 rounded-lg">{t.owned[locale]}</span>;
    }
    if (status === "active") {
      const until = item.activeUntil ? new Date(item.activeUntil) : null;
      const daysLeft = until ? Math.ceil((until.getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
      return (
        <span className="text-xs font-medium text-violet-600 bg-violet-50 px-2 py-1 rounded-lg">
          {t.active[locale]}{daysLeft ? ` â€” ${daysLeft}${t.daysLeft[locale]}` : ""}
        </span>
      );
    }
    if (status === "coupon_active") {
      return <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">{t.couponActive[locale]}</span>;
    }
    if (status === "level_required") {
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-ink/50">
          <Lock className="w-3 h-3" /> {t.levelRequired[locale]} {item.levelRequired}
        </span>
      );
    }
    if (status === "insufficient_fragments") {
      return <span className="text-xs font-medium text-red-500">{t.insufficientFragments[locale]}</span>;
    }

    if (confirm === item.slug) {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleBuy(item.slug)}
            disabled={buying === item.slug}
            className="px-3 py-1 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors disabled:opacity-50"
          >
            {buying === item.slug ? <Loader2 className="w-3 h-3 animate-spin" /> : t.confirmBuy[locale]}
          </button>
          <button
            onClick={() => setConfirm(null)}
            className="text-xs text-ink/40 hover:text-ink/60"
          >
            {t.cancel[locale]}
          </button>
        </div>
      );
    }

    return (
      <button
        onClick={() => setConfirm(item.slug)}
        className="px-3 py-1.5 bg-pink-500 text-white text-xs font-bold rounded-lg shadow-sm hover:shadow-md hover:bg-pink-600 transition-all hover:scale-[1.02]"
      >
        {t.buy[locale]} — {getItemFragmentsCost(item).toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} Fragments
      </button>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-pink-500" />
      </div>
    );
  }

  // â”€â”€â”€ Auth screen (not verified yet) â”€â”€â”€
  if (authState !== "confirmed") {
    return (
      <div className="min-h-screen px-4 py-8 max-w-md mx-auto">
        <Link
          href="/hub"
          className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.back[locale]}
        </Link>

        <div className="text-center mb-8">
          <div className="h-16 w-16 rounded-2xl bg-pink-50 flex items-center justify-center mx-auto mb-4">
            <ShoppingBag className="h-8 w-8 text-pink-500" />
          </div>
          <h1 className="text-2xl font-bold text-ink mb-2">{t.title[locale]}</h1>
          <p className="text-sm text-ink/50">{t.authDesc[locale]}</p>
        </div>

        {authState === "idle" && (
          <div className="space-y-4">
            <button
              onClick={startAuth}
              className="w-full py-3 bg-pink-500 text-white font-bold rounded-xl hover:bg-pink-600 transition-colors"
            >
              {t.authVerify[locale]}
            </button>
            <div className="text-center">
              <button
                onClick={enableDemo}
                className="px-4 py-2 bg-amber-100 text-amber-700 font-medium rounded-xl text-sm hover:bg-amber-200 transition-colors"
              >
                {t.demoMode[locale]} â€” {t.demoDesc[locale]}
              </button>
            </div>
          </div>
        )}

      </div>
    );
  }

  // â”€â”€â”€ Shop (verified) â”€â”€â”€
  return (
    <div className="min-h-screen px-4 py-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/hub"
          className="inline-flex items-center gap-1.5 text-sm text-ink/40 hover:text-ink/60 transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {t.back[locale]}
        </Link>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-pink-50 flex items-center justify-center">
            <ShoppingBag className="h-6 w-6 text-pink-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-ink">{t.title[locale]}</h1>
            {player && (
              <p className="text-sm text-ink/50">
                {t.availableFragments[locale]}: <span className="font-bold text-pink-600">{fragmentsBalance.toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} Fragments</span>
                {" Â· "}{t.level[locale]} {player.level}
                {demo && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">DEMO</span>}
              </p>
            )}
            {verifiedAddress && !demo && (
              <p className="text-[10px] text-ink/50 font-mono truncate max-w-[200px]">
                {verifiedAddress}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* No player found after auth */}
      {!player && !demo && verifiedAddress && (
        <div className="bg-ink/[0.03] rounded-2xl p-6 mb-6 text-center space-y-3">
          <p className="text-sm text-ink/60">
            {t.noFragmentsProfile[locale]}
          </p>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all border ${
              category === cat
                ? "bg-pink-500 text-white shadow-md border-pink-500"
                : "bg-white text-ink/80 border-ink/15 hover:bg-ink/[0.06] hover:border-ink/25"
            }`}
          >
            {cat !== "all" && CATEGORY_ICONS[cat]}
            {catLabels[cat]}
          </button>
        ))}
      </div>

      {/* Items grid */}
      <div className="grid gap-3">
        {filtered.map((item) => (
          <div
            key={item.slug}
            className={`rounded-2xl border-2 border-ink/5 bg-white/80 backdrop-blur-sm p-4 flex items-center gap-4 transition-all hover:shadow-md ${
              item.status === "level_required" || item.status === "insufficient_fragments"
                ? "opacity-60"
                : ""
            }`}
          >
            <div className="text-3xl flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-ink/[0.03]">
              {ITEM_ICONS[item.icon] || "\u{1F4E6}"}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="font-bold text-sm text-ink truncate">{item.name}</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${CATEGORY_COLORS[item.category] || ""}`}>
                  {catLabels[item.category]}
                </span>
              </div>
              <p className="text-xs text-ink/50 leading-relaxed">{item.description}</p>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs font-bold text-pink-600">{getItemFragmentsCost(item).toLocaleString(locale === "fr" ? "fr-FR" : "en-US")} Fragments</span>
                {item.levelRequired > 1 && (
                  <span className="text-[10px] text-ink/40">Lv.{item.levelRequired}+</span>
                )}
              </div>
            </div>

            <div className="flex-shrink-0">
              {getStatusButton(item)}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-ink/50 text-sm">
          {t.noItems[locale]}
        </div>
      )}
    </div>
  );
}
