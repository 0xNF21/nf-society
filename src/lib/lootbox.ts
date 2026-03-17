const PROBS = [0.60, 0.25, 0.10, 0.04, 0.01];
const MULTIPLIERS = [0.7, 0.9, 1.4, 3.0, 7.5];

export type RewardEntry = { probability: number; reward: number };

export function getRewardTable(priceCrc: number): RewardEntry[] {
  const rewards = MULTIPLIERS.map(m => Math.round(priceCrc * m));
  return PROBS.map((p, i) => ({ probability: p, reward: rewards[i] }));
}

export function computeRtp(priceCrc: number): number {
  const table = getRewardTable(priceCrc);
  const ev = table.reduce((sum, e) => sum + e.probability * e.reward, 0);
  return ev / priceCrc;
}

export function getRandomReward(priceCrc: number): number {
  const rand = Math.random() * 100;
  const table = getRewardTable(priceCrc);
  let cumulative = 0;
  for (const entry of table) {
    cumulative += entry.probability * 100;
    if (rand < cumulative) return entry.reward;
  }
  return table[table.length - 1].reward;
}
