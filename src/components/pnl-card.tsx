"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { Download, Check, Link2, Loader2 } from "lucide-react";

/* ─── CONFIG ───────────────────────────────────────────── */

const GAME_LABELS: Record<string, { fr: string; en: string; sub?: string }> = {
  morpion: { fr: "Morpion", en: "Tic-Tac-Toe", sub: "1vs1" },
  memory: { fr: "Memory", en: "Memory", sub: "1vs1" },
  dames: { fr: "Dames", en: "Checkers", sub: "1vs1" },
  relics: { fr: "Relics", en: "Relics", sub: "1vs1" },
  pfc: { fr: "Pierre-Feuille-Ciseaux", en: "Rock-Paper-Scissors", sub: "1vs1" },
  lootbox: { fr: "Lootbox", en: "Lootbox" },
  lottery: { fr: "Loterie", en: "Lottery" },
};

const RESULT_LABELS: Record<string, { fr: string; en: string }> = {
  win: { fr: "Victoire", en: "Victory" },
  loss: { fr: "Defaite", en: "Defeat" },
  draw: { fr: "Egalite", en: "Draw" },
  reward: { fr: "Recompense", en: "Reward" },
};

// Accent line + badge + amount color classes per result/tier
type StyleSet = { accent: string; badge: string; amount: string };
const STYLES: Record<string, StyleSet> = {
  win:       { accent: "linear-gradient(90deg, transparent, #10B981 40%, #34D399 60%, transparent)", badge: "rgba(16,185,129,0.12)|#10B981|rgba(16,185,129,0.25)", amount: "#10B981" },
  loss:      { accent: "linear-gradient(90deg, transparent, #EF4444 40%, #F87171 60%, transparent)", badge: "rgba(239,68,68,0.10)|#EF4444|rgba(239,68,68,0.2)", amount: "#EF4444" },
  draw:      { accent: "linear-gradient(90deg, transparent, #6B7280 40%, #9CA3AF 60%, transparent)", badge: "rgba(107,114,128,0.12)|#9CA3AF|rgba(107,114,128,0.2)", amount: "#9CA3AF" },
  jackpot:   { accent: "linear-gradient(90deg, transparent, #F59E0B 20%, #FCD34D 50%, #F59E0B 80%, transparent)", badge: "rgba(245,158,11,0.12)|#F59E0B|rgba(245,158,11,0.25)", amount: "#F59E0B" },
  legendary: { accent: "linear-gradient(90deg, transparent, #7C3AED 40%, #A78BFA 60%, transparent)", badge: "rgba(124,58,237,0.12)|#A78BFA|rgba(124,58,237,0.25)", amount: "#A78BFA" },
  mega:      { accent: "linear-gradient(90deg, transparent, #9333EA 40%, #C084FC 60%, transparent)", badge: "rgba(147,51,234,0.12)|#C084FC|rgba(147,51,234,0.25)", amount: "#C084FC" },
  rare:      { accent: "linear-gradient(90deg, transparent, #2563EB 40%, #60A5FA 60%, transparent)", badge: "rgba(37,99,235,0.12)|#60A5FA|rgba(37,99,235,0.25)", amount: "#60A5FA" },
  common:    { accent: "linear-gradient(90deg, transparent, #4B5563 40%, #9CA3AF 60%, transparent)", badge: "rgba(75,85,99,0.12)|#9CA3AF|rgba(75,85,99,0.2)", amount: "#9CA3AF" },
  reward:    { accent: "linear-gradient(90deg, transparent, #8B5CF6 40%, #A78BFA 60%, transparent)", badge: "rgba(124,58,237,0.12)|#A78BFA|rgba(124,58,237,0.25)", amount: "#10B981" },
};

function getStyleKey(result: string, tier?: string): string {
  if (tier) {
    const t = tier.toLowerCase().replace(/[^a-z]/g, "");
    if (STYLES[t]) return t;
  }
  return STYLES[result] ? result : "win";
}

function parseBadge(s: string) {
  const [bg, color, border] = s.split("|");
  return { bg, color, border };
}

const LOOTBOX_IMAGES: Record<string, string> = {
  common: "/lootbox/common.png",
  rare: "/lootbox/rare.png",
  mega: "/lootbox/mega.png",
  legendary: "/lootbox/legendary.png",
  jackpot: "/lootbox/jackpot.png",
};

const LOOTBOX_EMOJIS: Record<string, string> = {
  jackpot: "\uD83D\uDC51",
  legendary: "\u2728",
  mega: "\uD83D\uDD25",
  rare: "\uD83D\uDC8E",
  common: "\uD83C\uDFB0",
};

const RARITY_STARS: Record<string, number> = {
  jackpot: 5, legendary: 4, mega: 3, rare: 3, common: 1,
};

/* ─── SVG BANNERS ──────────────────────────────────────── */

function MorpionBanner({ isWin }: { isWin: boolean }) {
  const color = isWin ? "#10B981" : "#EF4444";
  const bg = isWin ? "radial-gradient(circle at 50% 50%, #1a1a3e 0%, #0a0a18 100%)" : "radial-gradient(circle at 50% 50%, #2e1a1a 0%, #0f0a0a 100%)";
  return (
    <div style={{ width: "100%", height: 140, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: bg }}>
      <svg width="100%" height="140" viewBox="0 0 400 140" xmlns="http://www.w3.org/2000/svg">
        <g opacity="0.25" stroke={color} strokeWidth="1.5">
          <line x1="150" y1="30" x2="150" y2="115" /><line x1="200" y1="30" x2="200" y2="115" />
          <line x1="125" y1="55" x2="225" y2="55" /><line x1="125" y1="90" x2="225" y2="90" />
        </g>
        <text x="132" y="52" fontSize="20" opacity="0.9">{"\uD83E\uDDE0"}</text>
        <text x="182" y="52" fontSize="20" opacity="0.5">{"\uD83D\uDC41\uFE0F"}</text>
        <text x="132" y="87" fontSize="20" opacity="0.5">{"\uD83D\uDC41\uFE0F"}</text>
        <text x="182" y="87" fontSize="20" opacity="0.9">{"\uD83E\uDDE0"}</text>
        <text x="132" y="122" fontSize="20" opacity="0.9">{"\uD83E\uDDE0"}</text>
        <line x1={isWin ? "142" : "192"} y1="38" x2={isWin ? "142" : "192"} y2="125" stroke={color} strokeWidth="2.5" opacity="0.7" strokeLinecap="round" />
      </svg>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, #16161F)" }} />
    </div>
  );
}

function MemoryBanner() {
  return (
    <div style={{ width: "100%", height: 140, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 50%, #1a2e1a 0%, #0a0f0a 100%)" }}>
      <svg width="100%" height="140" viewBox="0 0 400 140" xmlns="http://www.w3.org/2000/svg">
        <rect x="115" y="28" width="28" height="36" rx="5" fill="#10B981" opacity="0.7" />
        <rect x="148" y="28" width="28" height="36" rx="5" fill="#10B981" opacity="0.7" />
        <rect x="181" y="28" width="28" height="36" rx="5" fill="#1a3a2a" opacity="0.6" stroke="#10B981" strokeWidth="0.5" />
        <rect x="214" y="28" width="28" height="36" rx="5" fill="#1a3a2a" opacity="0.6" stroke="#10B981" strokeWidth="0.5" />
        <rect x="115" y="70" width="28" height="36" rx="5" fill="#1a3a2a" opacity="0.6" stroke="#10B981" strokeWidth="0.5" />
        <rect x="148" y="70" width="28" height="36" rx="5" fill="#2563EB" opacity="0.7" />
        <rect x="181" y="70" width="28" height="36" rx="5" fill="#2563EB" opacity="0.7" />
        <rect x="214" y="70" width="28" height="36" rx="5" fill="#1a3a2a" opacity="0.6" stroke="#10B981" strokeWidth="0.5" />
        <text x="122" y="52" fontSize="14">{"\uD83E\uDD89"}</text>
        <text x="155" y="52" fontSize="14">{"\uD83E\uDD89"}</text>
        <text x="155" y="94" fontSize="14">{"\u26A1"}</text>
        <text x="188" y="94" fontSize="14">{"\u26A1"}</text>
      </svg>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, #16161F)" }} />
    </div>
  );
}

function DamesBanner() {
  return (
    <div style={{ width: "100%", height: 140, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 50%, #1a1a2e 0%, #0a0a14 100%)" }}>
      <svg width="100%" height="140" viewBox="0 0 400 140" xmlns="http://www.w3.org/2000/svg">
        {Array.from({ length: 5 }).flatMap((_, r) => Array.from({ length: 8 }).map((_, c) => (r + c) % 2 === 0 ? (
          <rect key={`${r}-${c}`} x={125 + c * 19} y={20 + r * 22} width="19" height="22" fill="#ffffff08" />
        ) : null))}
        <circle cx="163" cy="42" r="8" fill="#EF4444" opacity="0.8" /><circle cx="163" cy="42" r="4" fill="#EF444480" />
        <circle cx="220" cy="86" r="8" fill="#3B82F6" opacity="0.8" /><circle cx="220" cy="86" r="4" fill="#3B82F680" />
        <circle cx="182" cy="64" r="8" fill="#EF4444" opacity="0.5" />
      </svg>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, #16161F)" }} />
    </div>
  );
}

function RelicsBanner() {
  return (
    <div style={{ width: "100%", height: 140, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 50%, #0a1a2e 0%, #060e18 100%)" }}>
      <svg width="100%" height="140" viewBox="0 0 400 140" xmlns="http://www.w3.org/2000/svg">
        {Array.from({ length: 6 }).flatMap((_, r) => Array.from({ length: 6 }).map((_, c) => (
          <rect key={`${r}-${c}`} x={140 + c * 20} y={15 + r * 20} width="20" height="20" fill="none" stroke="#ffffff08" strokeWidth="0.5" />
        )))}
        <circle cx="170" cy="35" r="6" fill="#EF4444" opacity="0.6" /><text x="167" y="38" fontSize="8" fill="white">X</text>
        <circle cx="210" cy="55" r="6" fill="#3B82F6" opacity="0.4" />
        <rect x="180" y="85" width="40" height="8" rx="4" fill="#F59E0B30" stroke="#F59E0B" strokeWidth="0.8" opacity="0.6" />
        <circle cx="160" cy="95" r="4" fill="#ffffff15" />
      </svg>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, #16161F)" }} />
    </div>
  );
}

function PfcBanner() {
  return (
    <div style={{ width: "100%", height: 140, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 50%, #1a1a2e 0%, #0a0a14 100%)" }}>
      <svg width="100%" height="140" viewBox="0 0 400 140" xmlns="http://www.w3.org/2000/svg">
        <text x="135" y="75" fontSize="40" opacity="0.8">{"\u270A"}</text>
        <text x="180" y="95" fontSize="40" opacity="0.6">{"\u270B"}</text>
        <text x="220" y="60" fontSize="30" opacity="0.4">{"\u270C\uFE0F"}</text>
      </svg>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, #16161F)" }} />
    </div>
  );
}

function LootboxBanner({ tier }: { tier: string }) {
  const key = tier.toLowerCase().replace(/[^a-z]/g, "") || "common";
  const img = LOOTBOX_IMAGES[key];
  const emoji = LOOTBOX_EMOJIS[key] || "\uD83D\uDCE6";
  const glowColor = STYLES[key]?.amount || "#8B5CF6";

  return (
    <div style={{ width: "100%", height: 140, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a18" }}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", zIndex: 2, filter: `drop-shadow(0 0 20px ${glowColor}60)` }} />
      ) : (
        <div style={{ fontSize: 80, zIndex: 2, filter: `drop-shadow(0 0 20px ${glowColor}60)`, animation: "pnlFloat 3s ease-in-out infinite" }}>{emoji}</div>
      )}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, #16161F)", zIndex: 3 }} />
    </div>
  );
}

function LotteryBanner() {
  return (
    <div style={{ width: "100%", height: 140, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 50%, #1a2a1a 0%, #0a0f0a 100%)" }}>
      <div style={{ fontSize: 80, zIndex: 2, filter: "drop-shadow(0 0 20px rgba(16,185,129,0.5))", animation: "pnlFloat 3s ease-in-out infinite" }}>{"\uD83C\uDF89"}</div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 60, background: "linear-gradient(transparent, #16161F)", zIndex: 3 }} />
    </div>
  );
}

function GameBanner({ gameType, result, tier }: { gameType: string; result: string; tier?: string }) {
  switch (gameType) {
    case "morpion": return <MorpionBanner isWin={result === "win"} />;
    case "memory": return <MemoryBanner />;
    case "dames": return <DamesBanner />;
    case "relics": return <RelicsBanner />;
    case "pfc": return <PfcBanner />;
    case "lootbox": return <LootboxBanner tier={tier || "common"} />;
    case "lottery": return <LotteryBanner />;
    default: return <div style={{ width: "100%", height: 140, background: "#0a0a18" }} />;
  }
}

/* ─── CONFETTI (jackpot only) ──────────────────────────── */

function Confetti() {
  const colors = ["#F59E0B", "#FCD34D", "#ffffff", "#F0C040", "#FBBF24"];
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: 20, zIndex: 10 }}>
      {Array.from({ length: 25 }).map((_, i) => {
        const c = colors[Math.floor(Math.random() * colors.length)];
        const d = 2.5 + Math.random() * 3;
        const dl = Math.random() * 3;
        const sz = 4 + Math.random() * 4;
        const br = Math.random() > 0.5 ? "50%" : "2px";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${Math.random() * 100}%`,
              width: sz, height: sz,
              borderRadius: br,
              background: c,
              opacity: 0,
              animation: `pnlConfetti ${d}s ease-in ${dl}s infinite`,
            }}
          />
        );
      })}
    </div>
  );
}

/* ─── PROPS ────────────────────────────────────────────── */

export interface PnlCardProps {
  gameType: string;
  result: "win" | "loss" | "draw" | "reward";
  betCrc?: number;
  gainCrc?: number;
  rewardCrc?: number;
  grossAmount?: number;
  commissionPct?: number;
  playerName?: string;
  playerAvatar?: string;
  opponentName?: string;
  opponentAvatar?: string;
  gameLabel?: string;
  tier?: string;
  tierColor?: string;
  date?: string;
  stats?: string;
  locale?: "fr" | "en";
}

/* ─── CARD CONTENT ─────────────────────────────────────── */

function CardContent({ props }: { props: PnlCardProps }) {
  const locale = props.locale || "fr";
  const gameDef = GAME_LABELS[props.gameType];
  const gameName = props.gameLabel || gameDef?.[locale] || props.gameType;
  const gameSub = props.stats || gameDef?.sub || "";

  const styleKey = getStyleKey(props.result, props.tier);
  const style = STYLES[styleKey] || STYLES.win;
  const badge = parseBadge(style.badge);

  // Result label
  const tierKey = props.tier?.toLowerCase().replace(/[^a-z]/g, "") || "";
  const resultLabel = props.tier && STYLES[tierKey]
    ? props.tier
    : RESULT_LABELS[props.result]?.[locale] || props.result;

  // Net amount
  const netAmount = props.gainCrc ?? (props.rewardCrc !== undefined && props.betCrc !== undefined
    ? props.rewardCrc - props.betCrc : props.rewardCrc ?? 0);
  const isPositive = netAmount >= 0;
  const displayNet = (isPositive ? "+" : "\u2212") + Math.abs(netAmount);

  // Amount color
  const amountColor = isPositive ? (style.amount || "#10B981") : "#EF4444";
  const amountGlow = `0 0 25px ${amountColor}50`;
  const isJackpot = tierKey === "jackpot";

  // Commission detail
  const gross = props.grossAmount ?? props.rewardCrc ?? (props.betCrc ? props.betCrc * 2 : 0);
  const commAmt = props.commissionPct && gross > 0 ? Math.round(gross * props.commissionPct / 100 * 100) / 100 : 0;

  // Rarity stars
  const stars = tierKey ? (RARITY_STARS[tierKey] || 0) : 0;

  return (
    <div id="pnl-card-export" style={{ width: 400, borderRadius: 20, overflow: "hidden", background: "#16161F", border: "1px solid rgba(255,255,255,0.07)", position: "relative", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Confetti for jackpot */}
      {isJackpot && <Confetti />}

      {/* Accent line */}
      <div style={{ height: 3, width: "100%", background: style.accent, ...(isJackpot ? { animation: "pnlShimmer 2s ease-in-out infinite" } : {}) }} />

      {/* Banner */}
      <GameBanner gameType={props.gameType} result={props.result} tier={props.tier} />

      {/* Body */}
      <div style={{ padding: "16px 20px 20px" }}>
        {/* Header: brand + badge */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "#0F0F18", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>
              {"\uD83E\uDD89"}
            </div>
            <div style={{ fontFamily: "'Cinzel', serif", fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.6)", letterSpacing: "0.12em" }}>
              NF SOCIETY
            </div>
          </div>
          <div style={{
            padding: "5px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700,
            letterSpacing: "0.15em", textTransform: "uppercase",
            background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
            ...(isJackpot ? { animation: "pnlBadgePulse 1.5s ease-in-out infinite" } : {}),
          }}>
            {resultLabel}
          </div>
        </div>

        {/* Game + amount */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", marginBottom: 4, fontWeight: 500 }}>
              {gameName}{gameSub ? ` \u00B7 ${gameSub}` : ""}
            </div>
            <div>
              <span style={{
                fontFamily: "'Cinzel', serif", fontSize: 42, fontWeight: 900, lineHeight: 1,
                letterSpacing: "-0.02em", color: amountColor, textShadow: amountGlow,
                ...(isJackpot ? { animation: "pnlGoldGlow 2s ease-in-out infinite" } : {}),
              }}>
                {displayNet}
              </span>
              <span style={{ fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginLeft: 6 }}>CRC</span>
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 2 }}>
              {isPositive && props.betCrc ? (
                <>{locale === "fr" ? "Gain brut" : "Gross"} <span style={{ color: "rgba(255,255,255,0.35)" }}>+{gross} CRC</span>{commAmt > 0 && <> · Commission <span style={{ color: "rgba(255,255,255,0.35)" }}>&minus;{commAmt} CRC</span></>}</>
              ) : props.betCrc ? (
                <>{locale === "fr" ? "Mise perdue" : "Bet lost"} · <span style={{ color: "rgba(255,255,255,0.35)" }}>&minus;{props.betCrc} CRC</span></>
              ) : null}
            </div>
          </div>
          {stars > 0 && (
            <div style={{ display: "flex", gap: 2, paddingTop: 6 }}>
              {Array.from({ length: stars }).map((_, i) => (
                <span key={i} style={{ fontSize: 10 }}>{"\u2B50"}</span>
              ))}
            </div>
          )}
        </div>

        {/* Player row */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#0F0F18", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
            {props.playerAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.playerAvatar} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />
            ) : "\uD83E\uDDE0"}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "white", marginBottom: 1 }}>
              {props.playerName || (locale === "fr" ? "Joueur" : "Player")}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
              {props.opponentName ? `vs ${props.opponentName}` : ""}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.05)", marginBottom: 12 }} />

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>{locale === "fr" ? "Mise" : "Bet"}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.55)" }}>{props.betCrc ?? 0} CRC</span>
          </div>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>{props.date || new Date().toLocaleDateString()}</span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", letterSpacing: "0.04em" }}>nf-society.vercel.app</span>
        </div>
      </div>
    </div>
  );
}

/* ─── CSS KEYFRAMES (injected once) ────────────────────── */

function PnlStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700;900&family=Inter:wght@400;500;600;700;800&display=swap');
      @keyframes pnlFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      @keyframes pnlShimmer { 0%,100%{opacity:.7} 50%{opacity:1} }
      @keyframes pnlConfetti { 0%{transform:translateY(-10px) rotate(0deg);opacity:1} 100%{transform:translateY(350px) rotate(720deg);opacity:0} }
      @keyframes pnlBadgePulse { 0%,100%{box-shadow:0 0 0 0 rgba(245,158,11,0)} 50%{box-shadow:0 0 10px 2px rgba(245,158,11,0.2)} }
      @keyframes pnlGoldGlow { 0%,100%{text-shadow:0 0 30px rgba(245,158,11,.5)} 50%{text-shadow:0 0 55px rgba(245,158,11,.8),0 0 90px rgba(240,192,64,.25)} }
    `}</style>
  );
}

/* ─── TWITTER TEXT ──────────────────────────────────────── */

function buildTweetText(props: PnlCardProps): string {
  const locale = props.locale || "fr";
  const gameName = GAME_LABELS[props.gameType]?.[locale] || props.gameType;
  const net = props.gainCrc ?? (props.rewardCrc !== undefined && props.betCrc !== undefined ? props.rewardCrc - props.betCrc : 0);
  const sign = net >= 0 ? "+" : "";
  if (props.result === "win") {
    return locale === "fr"
      ? `${sign}${net} CRC sur ${gameName} ! \uD83C\uDFC6\n\nJoue sur NF Society \uD83D\uDC49 https://nf-society.vercel.app`
      : `${sign}${net} CRC on ${gameName}! \uD83C\uDFC6\n\nPlay on NF Society \uD83D\uDC49 https://nf-society.vercel.app`;
  }
  if (props.result === "reward") {
    return locale === "fr"
      ? `${sign}${net} CRC ${props.tier ? `(${props.tier})` : ""} sur ${gameName} ! \uD83C\uDFB0\n\nhttps://nf-society.vercel.app`
      : `${sign}${net} CRC ${props.tier ? `(${props.tier})` : ""} on ${gameName}! \uD83C\uDFB0\n\nhttps://nf-society.vercel.app`;
  }
  return `${sign}${net} CRC — ${gameName}\n\nhttps://nf-society.vercel.app`;
}

/* ─── EXPORTED COMPONENT ───────────────────────────────── */

export function PnlCard(props: PnlCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const locale = props.locale || "fr";

  const handleDownload = useCallback(async () => {
    if (downloading || !cardRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, { backgroundColor: null, scale: 2, useCORS: true, logging: false });
      const link = document.createElement("a");
      link.download = `nf-society-${props.gameType}-${props.result}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 2000);
    } catch (e) { console.error("Download failed:", e); }
    finally { setDownloading(false); }
  }, [downloading, props.gameType, props.result]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText("https://nf-society.vercel.app");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  const handleTwitter = useCallback(() => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(buildTweetText(props))}`, "_blank");
  }, [props]);

  return (
    <div className="flex flex-col items-center gap-3 my-4">
      <PnlStyles />
      <div className="w-full overflow-x-auto flex justify-center">
        <div ref={cardRef} style={{ display: "inline-block", flexShrink: 0 }}>
          <CardContent props={props} />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 w-full max-w-[400px]">
        <button onClick={handleCopy} className="flex-1 py-2.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] text-white/50 text-[11px] font-semibold hover:bg-white/[0.07] hover:text-white transition-all">
          {copied ? "\u2713 " + (locale === "fr" ? "Copie" : "Copied") : "\uD83D\uDCCB " + (locale === "fr" ? "Copier" : "Copy")}
        </button>
        <button onClick={handleTwitter} className="flex-1 py-2.5 rounded-[10px] border border-indigo-500/30 bg-[rgba(37,27,159,0.25)] text-indigo-400 text-[11px] font-semibold hover:bg-[rgba(37,27,159,0.4)] hover:text-white transition-all">
          {"\uD835\uDD4F"} {locale === "fr" ? "Partager" : "Share"}
        </button>
        <button onClick={handleDownload} disabled={downloading} className="flex-1 py-2.5 rounded-[10px] border border-white/[0.07] bg-white/[0.03] text-white/50 text-[11px] font-semibold hover:bg-white/[0.07] hover:text-white transition-all disabled:opacity-50">
          {downloaded ? "\u2713" : downloading ? "\u23F3" : "\u2B07\uFE0F"} {locale === "fr" ? "Image" : "Image"}
        </button>
      </div>
    </div>
  );
}
