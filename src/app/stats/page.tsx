import { computePlatformStats } from "@/lib/platform-stats";
import { computeXpPlatformStats } from "@/lib/platform-stats-xp";
import { isRealStakesEnabled } from "@/lib/stakes";
import StatsClient from "./client";
import StatsXpClient from "./stats-xp-client";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const crcEnabled = await isRealStakesEnabled();
  if (!crcEnabled) {
    const xpStats = await computeXpPlatformStats();
    return <StatsXpClient stats={xpStats} />;
  }
  const stats = await computePlatformStats();
  return <StatsClient stats={stats} />;
}
