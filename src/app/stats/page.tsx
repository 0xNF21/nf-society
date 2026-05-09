import { computePlatformStats } from "@/lib/platform-stats";
import { computeFragmentPlatformStats } from "@/lib/platform-stats-fragments";
import { isRealStakesEnabled } from "@/lib/stakes";
import StatsClient from "./client";
import StatsFragmentsClient from "./stats-fragments-client";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const crcEnabled = await isRealStakesEnabled();
  if (!crcEnabled) {
    const fragmentStats = await computeFragmentPlatformStats();
    return <StatsFragmentsClient stats={fragmentStats} />;
  }
  const stats = await computePlatformStats();
  return <StatsClient stats={stats} />;
}
