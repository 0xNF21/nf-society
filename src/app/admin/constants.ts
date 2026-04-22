/* ─── Shared constants for admin tabs ─── */
import { Flag, Ticket, Gift, Wallet, Sparkles, Clock, Shield, Trash2, Eye, EyeOff } from "lucide-react";
import type { FlagStatus, Tab } from "./types";

export const TABS: { key: Tab; label: string; icon: typeof Flag }[] = [
  { key: "flags",     label: "Flags",     icon: Flag },
  { key: "lotteries", label: "Loteries",  icon: Ticket },
  { key: "lootboxes", label: "Lootboxes", icon: Gift },
  { key: "payouts",   label: "Payouts",   icon: Wallet },
  { key: "xp",        label: "XP",        icon: Sparkles },
  { key: "shop",      label: "Shop",      icon: Gift },
  { key: "daily",     label: "Daily",     icon: Clock },
  { key: "badges",    label: "Badges",    icon: Shield },
  { key: "reset",     label: "Reset",     icon: Trash2 },
];

export const CATEGORY_COLORS: Record<string, string> = {
  chance: "border-amber-200 bg-amber-50/50",
  multiplayer: "border-violet-200 bg-violet-50/50",
  general: "border-sky-200 bg-sky-50/50",
};

export const CATEGORY_LABELS: Record<string, string> = {
  chance: "Jeux de chance",
  multiplayer: "Jeux multijoueur",
  general: "General",
};

export const STATUS_CONFIG: Record<FlagStatus, { label: string; icon: typeof Eye; color: string; bg: string }> = {
  enabled:     { label: "Actif",       icon: Eye,    color: "text-green-600", bg: "bg-green-100 border-green-300" },
  coming_soon: { label: "Coming Soon", icon: Clock,  color: "text-amber-600", bg: "bg-amber-100 border-amber-300" },
  hidden:      { label: "Cache",       icon: EyeOff, color: "text-ink/40",    bg: "bg-ink/5 border-ink/10" },
};

export const STATUS_ORDER: FlagStatus[] = ["enabled", "coming_soon", "hidden"];

export const PAYOUT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  wrapping: "bg-blue-100 text-blue-800",
  sending: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};
