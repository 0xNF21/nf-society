import { NextResponse } from "next/server";

const COW_API = "https://api.cow.fi/xdai/api/v1";
const CRC_TOKEN = "0xeef7b1f06b092625228c835dd5d5b14641d1e54a";
const USDC_E_TOKEN = "0x2a22f9c3b484c3629090feed35f17ff8f88f76f0";
const CRC_DECIMALS = 18;
const USDC_DECIMALS = 6;

let cachedPrice: { price: number; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function GET() {
  try {
    if (cachedPrice && Date.now() - cachedPrice.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json(cachedPrice);
    }

    const sellAmount = BigInt(10) ** BigInt(CRC_DECIMALS);

    const res = await fetch(`${COW_API}/quote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sellToken: CRC_TOKEN,
        buyToken: USDC_E_TOKEN,
        from: "0x0000000000000000000000000000000000000000",
        sellAmountBeforeFee: sellAmount.toString(),
        kind: "sell",
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`CoW API error: ${res.status} ${errText}`);
    }

    const data = await res.json();
    const buyAmount = Number(data.quote.buyAmount);
    const price = buyAmount / 10 ** USDC_DECIMALS;

    cachedPrice = { price, fetchedAt: Date.now() };
    return NextResponse.json(cachedPrice);
  } catch (error: any) {
    console.error("CRC price error:", error.message);
    if (cachedPrice) {
      return NextResponse.json(cachedPrice);
    }
    return NextResponse.json(
      { error: error.message || "Failed to fetch CRC price", price: null },
      { status: 500 }
    );
  }
}
