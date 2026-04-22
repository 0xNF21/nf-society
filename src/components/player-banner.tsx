"use client";

import { useLocale } from "@/components/language-provider";
import { translations } from "@/lib/i18n";

function shortenAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface PlayerBannerProps {
  p1Address: string | null;
  p2Address: string | null;
  myRole: "p1" | "p2" | null;
  profiles: Record<string, { name: string; imageUrl: string | null }>;
  p1Label?: string;
  p2Label?: string;
}

function PlayerCard({ addr, label, isMe, side, profiles }: {
  addr: string | null;
  label: string;
  isMe: boolean;
  side: "left" | "right";
  profiles: Record<string, { name: string; imageUrl: string | null }>;
}) {
  const { locale } = useLocale();
  const profile = addr ? profiles[addr.toLowerCase()] : null;
  const name = profile?.name || (addr ? shortenAddress(addr) : "???");

  return (
    <div className={`flex items-center gap-2 ${side === "right" ? "flex-row-reverse" : ""}`}>
      {profile?.imageUrl ? (
        <img src={profile.imageUrl} alt={name} className="w-10 h-10 rounded-full object-cover border-2 border-white/20 shadow" />
      ) : (
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow text-sm font-black ${
          side === "left" ? "bg-marine/20 text-marine" : "bg-citrus/20 text-citrus"
        }`}>
          {addr ? name.slice(0, 2).toUpperCase() : "?"}
        </div>
      )}
      <div className={side === "right" ? "text-right" : ""}>
        <p className="text-xs font-bold text-ink dark:text-white truncate max-w-[100px]">{name}</p>
        <p className="text-[10px] text-ink/40">
          {label} {isMe ? translations.gameLobby.youParens[locale] : ""}
        </p>
      </div>
    </div>
  );
}

export function PlayerBanner({ p1Address, p2Address, myRole, profiles, p1Label = "J1", p2Label = "J2" }: PlayerBannerProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/60 dark:bg-white/5 backdrop-blur-sm border border-ink/5">
      <PlayerCard addr={p1Address} label={p1Label} isMe={myRole === "p1"} side="left" profiles={profiles} />
      <span className="text-lg font-black text-ink/20">VS</span>
      <PlayerCard addr={p2Address} label={p2Label} isMe={myRole === "p2"} side="right" profiles={profiles} />
    </div>
  );
}
