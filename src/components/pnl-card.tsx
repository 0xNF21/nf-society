"use client";

import { useRef, useCallback, useState } from "react";
import { Download, Share2, Check } from "lucide-react";

// ── Game type labels ──
const GAME_LABELS: Record<string, { fr: string; en: string }> = {
  morpion: { fr: "Morpion", en: "Tic-Tac-Toe" },
  memory: { fr: "Memory", en: "Memory" },
  dames: { fr: "Dames", en: "Checkers" },
  relics: { fr: "Relics", en: "Relics" },
  pfc: { fr: "Pierre-Feuille-Ciseaux", en: "Rock-Paper-Scissors" },
  lootbox: { fr: "Lootbox", en: "Lootbox" },
  lottery: { fr: "Loterie", en: "Lottery" },
};

const RESULT_LABELS: Record<string, { fr: string; en: string }> = {
  win: { fr: "Victoire", en: "Victory" },
  loss: { fr: "Defaite", en: "Defeat" },
  draw: { fr: "Egalite", en: "Draw" },
  reward: { fr: "Recompense", en: "Reward" },
};

const RESULT_COLORS: Record<string, string> = {
  win: "#10B981",
  loss: "#EF4444",
  draw: "#F59E0B",
  reward: "#10B981",
};

export interface PnlCardProps {
  gameType: string;
  result: "win" | "loss" | "draw" | "reward";
  betCrc?: number;
  gainCrc?: number;
  rewardCrc?: number;
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

function formatGain(gain: number): string {
  if (gain > 0) return `+${gain}`;
  return String(gain);
}

function shortenAddr(addr?: string): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// ── Card visual (rendered as HTML, captured by html2canvas) ──
function CardContent({ props }: { props: PnlCardProps }) {
  const locale = props.locale || "fr";
  const gameLabel = props.gameLabel || GAME_LABELS[props.gameType]?.[locale] || props.gameType;
  const resultLabel = RESULT_LABELS[props.result]?.[locale] || props.result;
  const resultColor = RESULT_COLORS[props.result] || "#FFFFFF";

  const displayAmount = props.gainCrc !== undefined
    ? formatGain(props.gainCrc)
    : props.rewardCrc !== undefined
      ? `+${props.rewardCrc}`
      : "0";

  const isPositive = (props.gainCrc !== undefined && props.gainCrc >= 0) ||
    (props.rewardCrc !== undefined && props.rewardCrc >= 0);

  return (
    <div
      style={{
        width: 480,
        padding: 32,
        background: "linear-gradient(135deg, #0a0a0f 0%, #111118 50%, #0d0d14 100%)",
        borderRadius: 24,
        color: "#ffffff",
        fontFamily: "'Sora', 'Space Grotesk', system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background glow */}
      <div style={{
        position: "absolute",
        top: -60,
        right: -60,
        width: 200,
        height: 200,
        borderRadius: "50%",
        background: `radial-gradient(circle, ${resultColor}15 0%, transparent 70%)`,
      }} />

      {/* Header: logo + game type */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/nf-society-logo.png" alt="NF" style={{ width: 32, height: 32, borderRadius: 8 }} />
          <span style={{ fontSize: 14, fontWeight: 700, color: "#ffffff99", letterSpacing: 1 }}>NF SOCIETY</span>
        </div>
        <span style={{
          fontSize: 11,
          fontWeight: 600,
          color: resultColor,
          background: `${resultColor}18`,
          padding: "4px 10px",
          borderRadius: 8,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}>
          {resultLabel}
        </span>
      </div>

      {/* Game label + tier */}
      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 600, color: "#ffffff80" }}>{gameLabel}</span>
        {props.tier && (
          <span style={{
            marginLeft: 8,
            fontSize: 12,
            fontWeight: 800,
            color: props.tierColor || "#F59E0B",
            background: `${props.tierColor || "#F59E0B"}18`,
            padding: "2px 8px",
            borderRadius: 6,
          }}>
            {props.tier}
          </span>
        )}
      </div>

      {/* Big amount */}
      <div style={{ marginBottom: 24 }}>
        <span style={{
          fontSize: 56,
          fontWeight: 900,
          color: isPositive ? "#10B981" : "#EF4444",
          lineHeight: 1,
          letterSpacing: -2,
        }}>
          {displayAmount}
        </span>
        <span style={{ fontSize: 24, fontWeight: 700, color: "#ffffff50", marginLeft: 8 }}>CRC</span>
      </div>

      {/* Players */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        {props.playerAvatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={props.playerAvatar} alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover", border: "2px solid #ffffff20" }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#ffffff10", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#ffffff50" }}>
            {(props.playerName || "?").slice(0, 2).toUpperCase()}
          </div>
        )}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#ffffffcc" }}>
            {props.playerName || locale === "fr" ? "Joueur" : "Player"}
          </div>
          {props.opponentName && (
            <div style={{ fontSize: 12, color: "#ffffff50" }}>
              vs {props.opponentName}
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: "flex",
        gap: 16,
        paddingTop: 16,
        borderTop: "1px solid #ffffff10",
        fontSize: 12,
        color: "#ffffff50",
      }}>
        {props.betCrc !== undefined && (
          <div>
            <span style={{ color: "#ffffff30" }}>{locale === "fr" ? "Mise" : "Bet"}</span>
            <span style={{ marginLeft: 6, color: "#ffffffaa", fontWeight: 600 }}>{props.betCrc} CRC</span>
          </div>
        )}
        {props.stats && (
          <div>
            <span style={{ color: "#ffffffaa", fontWeight: 600 }}>{props.stats}</span>
          </div>
        )}
        {props.date && (
          <div style={{ marginLeft: "auto" }}>
            <span style={{ color: "#ffffff30" }}>{props.date}</span>
          </div>
        )}
      </div>

      {/* Watermark */}
      <div style={{ marginTop: 16, textAlign: "center", fontSize: 10, color: "#ffffff20", letterSpacing: 1 }}>
        nf-society.vercel.app
      </div>
    </div>
  );
}

// ── Exported component with share button ──
export function PnlCard(props: PnlCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [shared, setShared] = useState(false);

  const handleShare = useCallback(async () => {
    if (!cardRef.current || sharing) return;
    setSharing(true);

    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: null,
        scale: 2,
        useCORS: true,
        logging: false,
      });

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png")
      );
      if (!blob) throw new Error("Failed to generate image");

      // Try native share (mobile)
      if (navigator.share && navigator.canShare?.({ files: [new File([blob], "nf-society-result.png", { type: "image/png" })] })) {
        const file = new File([blob], "nf-society-result.png", { type: "image/png" });
        await navigator.share({ files: [file] });
      } else {
        // Fallback: download
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `nf-society-${props.gameType}-${props.result}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      setShared(true);
      setTimeout(() => setShared(false), 2000);
    } catch (err) {
      console.error("Share failed:", err);
    } finally {
      setSharing(false);
    }
  }, [sharing, props.gameType, props.result]);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Card preview */}
      <div ref={cardRef} style={{ display: "inline-block" }}>
        <CardContent props={props} />
      </div>

      {/* Share button */}
      <button
        onClick={handleShare}
        disabled={sharing}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-sm font-semibold transition-all disabled:opacity-50"
      >
        {shared ? (
          <><Check className="w-4 h-4 text-green-400" />{props.locale === "fr" ? "Telecharge !" : "Downloaded!"}</>
        ) : sharing ? (
          <>{props.locale === "fr" ? "Generation..." : "Generating..."}</>
        ) : (
          <><Share2 className="w-4 h-4" />{props.locale === "fr" ? "Partager" : "Share"}</>
        )}
      </button>
    </div>
  );
}
