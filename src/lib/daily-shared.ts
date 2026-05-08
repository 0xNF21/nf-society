// Shared constants used by both server (daily.ts) and client (spin-wheel.tsx)
// NO server imports here (no db, no payout, no ethers)

export type DailyWheelResult = {
  type: string;
  label: string;
  crcValue: number;
  xpValue: number;
  segmentIndex: number;
  color?: string;
};

export type DailyWheelSegment = {
  type: string;
  label: string;
  color: string;
};

export const DAILY_WHEEL_SEGMENTS: DailyWheelSegment[] = [
  { type: "xp_75",     label: "+75 XP",     color: "#10B981" },
  { type: "xp_200",    label: "+200 XP",    color: "#38BDF8" },
  { type: "xp_500",    label: "+500 XP",    color: "#8B5CF6" },
  { type: "crc_1_rare", label: "+1 CRC",    color: "#F59E0B" },
  { type: "crc_10_rare", label: "+10 CRC",  color: "#EC4899" },
];

export type SpinResult = DailyWheelResult;
export type SpinSegment = DailyWheelSegment;
export const SPIN_SEGMENTS = DAILY_WHEEL_SEGMENTS;
