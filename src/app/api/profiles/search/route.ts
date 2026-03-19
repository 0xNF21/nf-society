import { NextRequest, NextResponse } from "next/server";

const CIRCLES_RPC_URL = process.env.NEXT_PUBLIC_CIRCLES_RPC_URL || "https://rpc.aboutcircles.com/";

async function searchProfiles(query: string) {
  try {
    const res = await fetch(CIRCLES_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "circles_searchProfiles", params: [query] }),
    });
    const data = await res.json();
    const profiles: any[] = data?.result ?? [];

    return profiles
      .filter((p: any) => p.avatarType === "CrcV2_RegisterHuman")
      .slice(0, 8)
      .map((p: any) => {
        let imageUrl: string | null = null;
        const raw = p.previewImageUrl || p.imageUrl;
        if (raw?.startsWith("data:")) imageUrl = raw;
        else if (raw?.startsWith("ipfs://")) imageUrl = `https://ipfs.io/ipfs/${raw.replace("ipfs://", "")}`;
        else if (raw) imageUrl = raw;
        return {
          address: (p.address as string).toLowerCase(),
          name: p.name as string,
          imageUrl,
        };
      });
  } catch { return []; }
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q || q.length < 2) return NextResponse.json({ results: [] });

  const results = await searchProfiles(q);
  return NextResponse.json({ results });
}
