import { computePlatformStats } from "@/lib/platform-stats";
import StatsClient from "./client";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const stats = await computePlatformStats();
  return <StatsClient stats={stats} />;
}
