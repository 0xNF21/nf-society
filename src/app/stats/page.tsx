import { computePlatformStats } from "@/lib/platform-stats";
import StatsClient from "./client";

export const revalidate = 300; // cache 5 min

export default async function StatsPage() {
  const stats = await computePlatformStats();
  return <StatsClient stats={stats} />;
}
