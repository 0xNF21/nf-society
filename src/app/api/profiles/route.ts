import { NextResponse } from "next/server";

const CIRCLES_RPC_URL = process.env.NEXT_PUBLIC_CIRCLES_RPC_URL || "https://rpc.aboutcircles.com/";
const IPFS_GATEWAY = "https://ipfs.io/ipfs/";

type CirclesProfile = {
  name: string;
  imageUrl: string | null;
};

const profileCache = new Map<string, { profile: CirclesProfile; timestamp: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

async function getAvatarCid(address: string): Promise<string | null> {
  try {
    const res = await fetch(CIRCLES_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "circles_getAvatarInfo",
        params: [address],
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const cidV0 = data?.result?.cidV0;
    if (!cidV0 || cidV0 === "") return null;
    return cidV0;
  } catch {
    return null;
  }
}

async function getProfileFromIpfs(cid: string): Promise<CirclesProfile | null> {
  try {
    const res = await fetch(`${IPFS_GATEWAY}${cid}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const name = data?.name || null;
    if (!name) return null;

    let imageUrl: string | null = null;
    if (data.previewImageUrl && typeof data.previewImageUrl === "string") {
      if (data.previewImageUrl.startsWith("data:")) {
        imageUrl = data.previewImageUrl;
      } else if (data.previewImageUrl.startsWith("ipfs://")) {
        imageUrl = `${IPFS_GATEWAY}${data.previewImageUrl.replace("ipfs://", "")}`;
      } else {
        imageUrl = data.previewImageUrl;
      }
    } else if (data.imageUrl && typeof data.imageUrl === "string") {
      imageUrl = data.imageUrl;
    }

    return { name, imageUrl };
  } catch {
    return null;
  }
}

async function fetchProfile(address: string): Promise<CirclesProfile> {
  const norm = normalizeAddress(address);
  const cached = profileCache.get(norm);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.profile;
  }

  const fallback: CirclesProfile = { name: "", imageUrl: null };

  const cid = await getAvatarCid(norm);
  if (!cid) {
    profileCache.set(norm, { profile: fallback, timestamp: Date.now() });
    return fallback;
  }

  const profile = await getProfileFromIpfs(cid);
  const result = profile || fallback;
  profileCache.set(norm, { profile: result, timestamp: Date.now() });
  return result;
}

export async function POST(req: Request) {
  try {
    const { addresses } = await req.json();
    if (!Array.isArray(addresses) || addresses.length === 0) {
      return NextResponse.json({ error: "addresses array required" }, { status: 400 });
    }

    const limited = addresses.slice(0, 50);
    const results: Record<string, CirclesProfile> = {};

    await Promise.all(
      limited.map(async (addr: string) => {
        const profile = await fetchProfile(addr);
        results[normalizeAddress(addr)] = profile;
      })
    );

    return NextResponse.json({ profiles: results });
  } catch (error) {
    console.error("Profiles fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch profiles" }, { status: 500 });
  }
}
