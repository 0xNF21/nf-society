function getRewardTable(priceCrc: number): Array<{ threshold: number; reward: number }> {
  return [
    { threshold: 60,  reward: Math.round(priceCrc * 0.7) },
    { threshold: 85,  reward: Math.round(priceCrc * 0.9) },
    { threshold: 95,  reward: Math.round(priceCrc * 1.4) },
    { threshold: 99,  reward: Math.round(priceCrc * 3.0) },
    { threshold: 100, reward: Math.round(priceCrc * 7.0) },
  ];
}

export function getRandomReward(priceCrc: number): number {
  const rand = Math.random() * 100;
  const table = getRewardTable(priceCrc);
  for (const entry of table) {
    if (rand < entry.threshold) return entry.reward;
  }
  return table[table.length - 1].reward;
}
