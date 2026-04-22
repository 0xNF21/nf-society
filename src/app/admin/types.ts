/* ─── Shared types for admin tabs ─── */
export type FlagStatus = "enabled" | "coming_soon" | "hidden";

export interface FlagRow {
  key: string;
  status: FlagStatus;
  label: string;
  category: string;
  updatedAt: string;
}

export type Tab = "flags" | "lotteries" | "lootboxes" | "payouts" | "xp" | "shop" | "daily" | "badges" | "reset";
