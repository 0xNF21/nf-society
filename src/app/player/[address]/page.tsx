import { db } from "@/lib/db";
import { players } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { computeLevel, getLevelName, xpToNextLevel, LEVELS } from "@/lib/xp";
import { getPlayerBadges } from "@/lib/badges";
import { getPlayerStats, getPlayerGamesBreakdown } from "@/lib/multiplayer";
import { getPrivacyFlags } from "@/lib/privacy";
import PlayerProfileClient from "./client";

const CIRCLES_RPC_URL = process.env.NEXT_PUBLIC_CIRCLES_RPC_URL || "https://rpc.aboutcircles.com/";

async function getCirclesProfile(address: string) {
  try {
    // Use circles_searchProfiles RPC which returns name + cid for humans
    const res = await fetch(CIRCLES_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        method: "circles_searchProfiles",
        params: [address],
      }),
      next: { revalidate: 60 },
    });
    const data = await res.json();
    const profiles: any[] = data?.result ?? [];
    const match = profiles.find(
      (p: any) => (p.address as string).toLowerCase() === address.toLowerCase()
        && p.avatarType === "CrcV2_RegisterHuman"
    );
    if (!match) return null;

    let imageUrl: string | null = null;
    // Try direct fields first
    const raw = match.previewImageUrl || match.imageUrl;
    if (raw?.startsWith("data:")) imageUrl = raw;
    else if (raw?.startsWith("ipfs://")) imageUrl = `https://ipfs.io/ipfs/${raw.replace("ipfs://", "")}`;
    else if (raw) imageUrl = raw;

    // If no image but has CID, fetch from IPFS
    if (!imageUrl && match.cid) {
      try {
        const ipfsRes = await fetch(`https://ipfs.io/ipfs/${match.cid}`, { signal: AbortSignal.timeout(5000) });
        if (ipfsRes.ok) {
          const ipfsData = await ipfsRes.json();
          const ipfsRaw = ipfsData.previewImageUrl || ipfsData.imageUrl;
          if (ipfsRaw?.startsWith("data:")) imageUrl = ipfsRaw;
          else if (ipfsRaw?.startsWith("ipfs://")) imageUrl = `https://ipfs.io/ipfs/${ipfsRaw.replace("ipfs://", "")}`;
          else if (ipfsRaw) imageUrl = ipfsRaw;
        }
      } catch {}
    }

    return { name: match.name, imageUrl };
  } catch { return null; }
}

export default async function PlayerPage({
  params,
}: {
  params: { address: string };
}) {
  const address = params.address.toLowerCase();

  const [player] = await db.select().from(players).where(eq(players.address, address));
  const profile = await getCirclesProfile(address);

  const xp = player?.xp ?? 0;
  const streak = player?.streak ?? 0;
  const level = computeLevel(xp);
  const levelName = getLevelName(level);
  const toNext = xpToNextLevel(xp);
  const currentLevelXp = LEVELS.find(l => l.level === level)?.xpRequired ?? 0;
  const nextLevelXp = LEVELS.find(l => l.level === level + 1)?.xpRequired ?? currentLevelXp;
  const progressPct = nextLevelXp === currentLevelXp
    ? 100
    : Math.round(((xp - currentLevelXp) / (nextLevelXp - currentLevelXp)) * 100);

  const name = profile?.name || `${address.slice(0, 6)}…${address.slice(-4)}`;
  const avatar = profile?.imageUrl || null;
  const badgesList = await getPlayerBadges(address);
  const [stats, gamesBreakdown, privacy] = await Promise.all([
    getPlayerStats(address),
    getPlayerGamesBreakdown(address),
    getPrivacyFlags(address),
  ]);

  return (
    <PlayerProfileClient
      address={address}
      name={name}
      avatar={avatar}
      xp={xp}
      level={level}
      levelName={levelName}
      toNext={toNext}
      progressPct={progressPct}
      streak={streak}
      levels={[...LEVELS]}
      badges={badgesList.map(b => ({ ...b, earnedAt: b.earnedAt?.toISOString() ?? null }))}
      stats={stats}
      gamesBreakdown={gamesBreakdown}
      privacy={privacy}
    />
  );
}
