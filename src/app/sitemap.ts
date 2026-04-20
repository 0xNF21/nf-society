import type { MetadataRoute } from "next";
import { GAME_REGISTRY, CHANCE_REGISTRY } from "@/lib/game-registry";

const BASE_URL = "https://nf-society.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const staticRoutes: Array<{ path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }> = [
    { path: "/", priority: 1.0, changeFrequency: "weekly" },
    { path: "/hub", priority: 0.9, changeFrequency: "weekly" },
    { path: "/multijoueur", priority: 0.8, changeFrequency: "weekly" },
    { path: "/chance", priority: 0.8, changeFrequency: "weekly" },
    { path: "/leaderboard", priority: 0.7, changeFrequency: "daily" },
    { path: "/stats", priority: 0.7, changeFrequency: "daily" },
    { path: "/shop", priority: 0.6, changeFrequency: "weekly" },
    { path: "/exchange", priority: 0.6, changeFrequency: "weekly" },
    { path: "/docs", priority: 0.5, changeFrequency: "monthly" },
    { path: "/dashboard-dao", priority: 0.5, changeFrequency: "weekly" },
    { path: "/behind-the-scenes", priority: 0.4, changeFrequency: "monthly" },
    { path: "/legal/terms", priority: 0.3, changeFrequency: "yearly" },
    { path: "/legal/privacy", priority: 0.3, changeFrequency: "yearly" },
    { path: "/legal/cookies", priority: 0.3, changeFrequency: "yearly" },
    { path: "/legal/imprint", priority: 0.3, changeFrequency: "yearly" },
  ];

  const chanceSlugOverrides: Record<string, string> = {
    lotteries: "loteries",
    coin_flip: "coin-flip",
    crash_dash: "crash-dash",
  };

  const multiLobbies = Object.keys(GAME_REGISTRY).map((key) => ({
    path: `/${key}`,
    priority: 0.7,
    changeFrequency: "weekly" as const,
  }));

  const chanceLobbies = Object.keys(CHANCE_REGISTRY)
    .filter((key) => !["daily", "lootboxes", "lotteries"].includes(key) || chanceSlugOverrides[key])
    .map((key) => ({
      path: `/${chanceSlugOverrides[key] ?? key}`,
      priority: 0.7,
      changeFrequency: "weekly" as const,
    }));

  const all = [...staticRoutes, ...multiLobbies, ...chanceLobbies];

  return all.map((r) => ({
    url: `${BASE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
