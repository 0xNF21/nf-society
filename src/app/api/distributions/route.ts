import { NextRequest, NextResponse } from "next/server";

const DISTRIBUTOR_ADDRESS = "0xDC195f7e711C66d9B01615cD6adc4CAffe6Ac7Ad";
const BLOCKSCOUT_BASE = "https://arbitrum.blockscout.com/api/v2";

let distributionCache: { data: any; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export const dynamic = "force-dynamic";

async function fetchAllTokenTransfers(): Promise<any[]> {
  const allItems: any[] = [];
  let url: string | null = `${BLOCKSCOUT_BASE}/addresses/${DISTRIBUTOR_ADDRESS}/token-transfers`;

  while (url) {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);

    const json = await res.json();
    const items = json.items || [];
    allItems.push(...items);

    if (json.next_page_params) {
      const params = new URLSearchParams();
      for (const [key, val] of Object.entries(json.next_page_params)) {
        params.set(key, String(val));
      }
      url = `${BLOCKSCOUT_BASE}/addresses/${DISTRIBUTOR_ADDRESS}/token-transfers?${params.toString()}`;
    } else {
      url = null;
    }
  }

  return allItems;
}

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";

    if (!refresh && distributionCache && Date.now() - distributionCache.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json(distributionCache.data);
    }

    const items = await fetchAllTokenTransfers();

    const fromAddr = DISTRIBUTOR_ADDRESS.toLowerCase();

    const outgoing = items.filter(
      (t: any) => t.from?.hash?.toLowerCase() === fromAddr
    );

    let totalUsd = 0;
    const transfers: Array<{
      amount: number;
      token: string;
      timestamp: string;
      txHash: string;
      recipient: string;
    }> = [];

    for (const t of outgoing) {
      const decimals = Number(t.token?.decimals || 6);
      const amount = Number(t.total?.value || 0) / 10 ** decimals;
      totalUsd += amount;
      transfers.push({
        amount,
        token: t.token?.symbol || "USDC",
        timestamp: t.timestamp,
        txHash: t.tx_hash,
        recipient: t.to?.hash || "",
      });
    }

    const result = {
      totalUsd,
      transferCount: transfers.length,
      transfers,
      fetchedAt: Date.now(),
    };

    distributionCache = { data: result, fetchedAt: Date.now() };
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Distributions API error:", error.message);
    if (distributionCache) return NextResponse.json(distributionCache.data);
    return NextResponse.json(
      { error: error.message || "Failed to fetch distributions", totalUsd: 0, transferCount: 0 },
      { status: 500 }
    );
  }
}
