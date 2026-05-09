/**
 * Fragments are the playable arcade balance.
 *
 * XP is reserved for progression/levels.
 */

export const CRC_TO_FRAGMENTS_RATIO = 10;

export function crcToFragments(crc: number): number {
  return Math.round(crc * CRC_TO_FRAGMENTS_RATIO);
}

export function fragmentsToCrc(fragments: number): number {
  return fragments / CRC_TO_FRAGMENTS_RATIO;
}

export function getFragmentsBalance(fragmentsEarned: number, fragmentsSpent: number): number {
  return fragmentsEarned - fragmentsSpent;
}

export function canAffordFragments(fragmentsEarned: number, fragmentsSpent: number, cost: number): boolean {
  return getFragmentsBalance(fragmentsEarned, fragmentsSpent) >= cost;
}
