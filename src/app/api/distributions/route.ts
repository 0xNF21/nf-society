import { NextRequest, NextResponse } from "next/server";

const DISTRIBUTOR_ADDRESS = "0xDC195f7e711C66d9B01615cD6adc4CAffe6Ac7Ad";
const PEANUT_V4_ADDRESS = "0x43B90099a203957F1adf35Dde15ac88b3e323e75";
const BLOCKSCOUT_BASE = "https://arbitrum.blockscout.com/api/v2";

let distributionCache: { data: any; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";

    if (!refresh && distributionCache && Date.now() - distributionCache.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json(distributionCache.data);
    }

    const res = await fetch(
      `${BLOCKSCOUT_BASE}/addresses/${DISTRIBUTOR_ADDRESS}/token-transfers`,
      { signal: AbortSignal.timeout(15000) }
    );

    if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);

    const json = await res.json();
    const items = json.items || [];

    const fromAddr = DISTRIBUTOR_ADDRESS.toLowerCase();
    const peanutAddr = PEANUT_V4_ADDRESS.toLowerCase();

    const peanutTransfers = items.filter(
      (t: any) =>
        t.from?.hash?.toLowerCase() === fromAddr &&
        t.to?.hash?.toLowerCase() === peanutAddr
    );

    let totalUsd = 0;
    const transfers: Array<{
      amount: number;
      token: string;
      timestamp: string;
      txHash: string;
    }> = [];

    for (const t of peanutTransfers) {
      const decimals = Number(t.token?.decimals || 6);
      const amount = Number(t.total?.value || 0) / 10 ** decimals;
      totalUsd += amount;
      transfers.push({
        amount,
        token: t.token?.symbol || "USDC",
        timestamp: t.timestamp,
        txHash: t.tx_hash,
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
