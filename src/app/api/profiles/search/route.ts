import { NextRequest, NextResponse } from "next/server";

const CIRCLES_RPC_URL = process.env.NEXT_PUBLIC_CIRCLES_RPC_URL || "https://rpc.aboutcircles.com/";

async function fetchIpfsProfile(cid: string): Promise<{ previewImageUrl?: string; imageUrl?: string } | null> {
  try {
    const res = await fetch(`https://ipfs.io/ipfs/${cid}`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function searchProfiles(query: string) {
  try {
    const res = await fetch(CIRCLES_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "circles_searchProfiles", params: [query] }),
    });
    const data = await res.json();
    const profiles: any[] = data?.result ?? [];

    const filtered = profiles
      .filter((p: any) => p.avatarType === "CrcV2_RegisterHuman")
      .slice(0, 8);

    // Fetch IPFS profiles in parallel to get images
    const results = await Promise.all(
      filtered.map(async (p: any) => {
        let imageUrl: string | null = null;

        // First try fields from RPC result directly
        const raw = p.previewImageUrl || p.imageUrl;
        if (raw?.startsWith("data:")) imageUrl = raw;
        else if (raw?.startsWith("ipfs://")) imageUrl = `https://ipfs.io/ipfs/${raw.replace("ipfs://", "")}`;
        else if (raw) imageUrl = raw;

        // If no image but has CID, fetch from IPFS
        if (!imageUrl && p.cid) {
          const ipfsData = await fetchIpfsProfile(p.cid);
          if (ipfsData) {
            const ipfsRaw = ipfsData.previewImageUrl || ipfsData.imageUrl;
            if (ipfsRaw?.startsWith("data:")) imageUrl = ipfsRaw;
            else if (ipfsRaw?.startsWith("ipfs://")) imageUrl = `https://ipfs.io/ipfs/${ipfsRaw.replace("ipfs://", "")}`;
            else if (ipfsRaw) imageUrl = ipfsRaw;
          }
        }

        return {
          address: (p.address as string).toLowerCase(),
          name: p.name as string,
          imageUrl,
        };
      })
    );

    return results;
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const results = await searchProfiles(q);
  return NextResponse.json({ results });
}
