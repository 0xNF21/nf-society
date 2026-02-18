import { NextResponse } from "next/server";

const ETH_RPC = "https://eth.llamarpc.com";
const TREASURY_ADDRESS = "0x2f233f212fe999edcdd300478dbddff5b609510a";

const TOKENS = [
  {
    symbol: "WBTC",
    name: "Wrapped BTC",
    address: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    decimals: 8,
    llamaId: "ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    color: "#F7931A",
  },
  {
    symbol: "ETH",
    name: "Ether",
    address: "native",
    decimals: 18,
    llamaId: "coingecko:ethereum",
    color: "#627EEA",
  },
  {
    symbol: "AAVE",
    name: "Aave Token",
    address: "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    decimals: 18,
    llamaId: "ethereum:0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
    color: "#B6509E",
  },
  {
    symbol: "FXN",
    name: "FXN Token",
    address: "0x365accfca291e7d3914637abf1f7635db165bb09",
    decimals: 18,
    llamaId: "ethereum:0x365accfca291e7d3914637abf1f7635db165bb09",
    color: "#4CAF50",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    decimals: 6,
    llamaId: "ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    color: "#2775CA",
  },
];

const ERC20_BALANCE_OF = "0x70a08231";

let cached: { data: any; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

async function rpcCall(method: string, params: any[]): Promise<any> {
  const res = await fetch(ETH_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  const json = await res.json();
  return json.result;
}

function bigIntToDecimal(raw: bigint, decimals: number): number {
  const str = raw.toString();
  if (decimals === 0) return Number(str);
  if (str.length <= decimals) {
    const padded = str.padStart(decimals + 1, "0");
    return parseFloat(padded.slice(0, padded.length - decimals) + "." + padded.slice(padded.length - decimals));
  }
  return parseFloat(str.slice(0, str.length - decimals) + "." + str.slice(str.length - decimals));
}

async function getERC20Balance(tokenAddress: string): Promise<bigint> {
  const paddedAddr = TREASURY_ADDRESS.slice(2).padStart(64, "0");
  const data = `${ERC20_BALANCE_OF}${paddedAddr}`;
  const result = await rpcCall("eth_call", [
    { to: tokenAddress, data },
    "latest",
  ]);
  return result ? BigInt(result) : BigInt(0);
}

async function getETHBalance(): Promise<bigint> {
  const result = await rpcCall("eth_getBalance", [TREASURY_ADDRESS, "latest"]);
  return result ? BigInt(result) : BigInt(0);
}

async function fetchPrices(): Promise<Record<string, number>> {
  const ids = TOKENS.map((t) => t.llamaId).join(",");
  const res = await fetch(
    `https://coins.llama.fi/prices/current/${ids}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`DeFi Llama error: ${res.status}`);
  const data = await res.json();
  const prices: Record<string, number> = {};
  for (const token of TOKENS) {
    prices[token.symbol] = data.coins?.[token.llamaId]?.price || 0;
  }
  return prices;
}

export async function GET() {
  try {
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    const [prices, ethBalance, ...erc20Balances] = await Promise.all([
      fetchPrices(),
      getETHBalance(),
      ...TOKENS.filter((t) => t.address !== "native").map((t) =>
        getERC20Balance(t.address)
      ),
    ]);

    let erc20Idx = 0;
    const holdings = TOKENS.map((token) => {
      let rawBalance: bigint;
      if (token.address === "native") {
        rawBalance = ethBalance;
      } else {
        rawBalance = erc20Balances[erc20Idx++];
      }
      const balance = bigIntToDecimal(rawBalance, token.decimals);
      const price = prices[token.symbol] || 0;
      const valueUsd = balance * price;

      return {
        symbol: token.symbol,
        name: token.name,
        balance,
        price,
        valueUsd,
        color: token.color,
      };
    }).filter((h) => h.balance > 0);

    const totalUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0);

    const result = {
      address: TREASURY_ADDRESS,
      chain: "ethereum",
      holdings,
      totalUsd,
      fetchedAt: Date.now(),
    };

    cached = { data: result, fetchedAt: Date.now() };
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Treasury API error:", error.message);
    if (cached) {
      return NextResponse.json(cached.data);
    }
    return NextResponse.json(
      { error: error.message || "Failed to fetch treasury data" },
      { status: 500 }
    );
  }
}
