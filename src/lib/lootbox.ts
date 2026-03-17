const TARGET_RTP = 0.98;

const PROBS = [0.60, 0.25, 0.10, 0.04, 0.01];
const MULTIPLIERS = [0.7, 0.9, 1.4, 3.0, 7.0];

export type RewardEntry = { probability: number; reward: number };

export function getRewardTable(priceCrc: number): RewardEntry[] {
  const rewards = MULTIPLIERS.map(m => Math.max(1, Math.floor(priceCrc * m)));

  const calcRtp = () =>
    PROBS.reduce((sum, p, i) => sum + p * rewards[i], 0) / priceCrc;

  let rtp = calcRtp();
  while (rtp < TARGET_RTP) {
    let bestIdx = -1;
    let bestDiff = Infinity;
    for (let i = 0; i < rewards.length; i++) {
      const bump = PROBS[i] / priceCrc;
      const newRtp = rtp + bump;
      const diff = Math.abs(TARGET_RTP - newRtp);
      if (newRtp <= TARGET_RTP && diff < bestDiff) {
        bestDiff = diff;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    rewards[bestIdx]++;
    rtp = calcRtp();
  }

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
