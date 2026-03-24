// Shared constants used by both server (daily.ts) and client (spin-wheel.tsx)
// NO server imports here (no db, no payout, no ethers)

export type ScratchResult = {
  type: string;
  label: string;
  crcValue: number;
  xpValue: number;
  symbols: string[];
};

export type SpinResult = {
  type: string;
  label: string;
  crcValue: number;
  xpValue: number;
  segmentIndex: number;
};

export const SPIN_SEGMENTS = [
  { type: "nothing",   label: "Rien",       color: "#6B7280" },
  { type: "xp_50",     label: "+50 XP",     color: "#8B5CF6" },
  { type: "crc_1",     label: "+1 CRC",     color: "#10B981" },
  { type: "xp_100",    label: "+100 XP",    color: "#6366F1" },
  { type: "crc_3",     label: "+3 CRC",     color: "#F59E0B" },
  { type: "streak_x2", label: "Streak x2",  color: "#EF4444" },
  { type: "crc_10",    label: "+10 CRC",    color: "#EC4899" },
  { type: "jackpot",   label: "JACKPOT",    color: "#FFD700" },
];
