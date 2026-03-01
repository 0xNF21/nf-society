import { NextResponse } from "next/server";

const ETH_TREASURY_ADDRESS = "0x2f233f212fe999edcdd300478dbddff5b609510a";
const GNOSIS_TREASURY_ADDRESS = "0xbf57dc790ba892590c640dc27b26b2665d30104f";
const ETH_BLOCKSCOUT = "https://eth.blockscout.com/api/v2";
const GNOSIS_BLOCKSCOUT = "https://gnosis.blockscout.com/api/v2";

const TOKEN_COLORS: Record<string, string> = {
  WBTC: "#F7931A",
  ETH: "#627EEA",
  AAVE: "#B6509E",
  FXN: "#4CAF50",
  USDC: "#2775CA",
  "USDC.E": "#2775CA",
  USDT: "#26A17B",
  DAI: "#F5AC37",
  SDAI: "#F5AC37",
  WETH: "#627EEA",
  LINK: "#2A5ADA",
  UNI: "#FF007A",
  xDAI: "#48A9A6",
};

const DEFAULT_COLORS = ["#6366F1", "#EC4899", "#14B8A6", "#F59E0B", "#8B5CF6", "#EF4444", "#06B6D4", "#84CC16"];

let cached: { data: any; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function bigIntToDecimal(rawStr: string, decimals: number): number {
  if (!rawStr || rawStr === "0") return 0;
  const str = rawStr.replace(/^0x/, "");
  if (decimals === 0) return Number(str);
  if (str.length <= decimals) {
    const padded = str.padStart(decimals + 1, "0");
    return parseFloat(padded.slice(0, padded.length - decimals) + "." + padded.slice(padded.length - decimals));
  }
  return parseFloat(str.slice(0, str.length - decimals) + "." + str.slice(str.length - decimals));
}

async function fetchTokensFromBlockscout(base: string, address: string): Promise<any[]> {
  const res = await fetch(
    `${base}/addresses/${address}/tokens?type=ERC-20`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`Blockscout tokens error: ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

async function fetchNativeBalance(base: string, address: string): Promise<string> {
  const res = await fetch(
    `${base}/addresses/${address}`,
    { signal: AbortSignal.timeout(10000) }
  );
  if (!res.ok) throw new Error(`Blockscout address error: ${res.status}`);
  const data = await res.json();
  return data.coin_balance || "0";
}

async function fetchTokenTransfers(base: string, address: string): Promise<any[]> {
  const res = await fetch(
    `${base}/addresses/${address}/token-transfers?type=ERC-20`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) throw new Error(`Blockscout transfers error: ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

async function fetchInternalTransactions(base: string, address: string): Promise<any[]> {
  const res = await fetch(
    `${base}/addresses/${address}/internal-transactions`,
    { signal: AbortSignal.timeout(15000) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.items || [];
}

function buildAcquisitionData(
  transfers: any[],
  internalTxs: any[],
  treasuryAddr: string
): Record<string, { costBasis: number; acquiredAt: string; txHash: string }> {
  const addr = treasuryAddr.toLowerCase();
  const acquisitions: Record<string, { costBasis: number; acquiredAt: string; txHash: string }> = {};

  const txGroups: Record<string, { ins: any[]; outs: any[]; ethIn: number; timestamp: string }> = {};
  for (const t of transfers) {
    const txHash = t.transaction_hash;
    if (!txGroups[txHash]) txGroups[txHash] = { ins: [], outs: [], ethIn: 0, timestamp: t.timestamp };
    const isIn = t.to?.hash?.toLowerCase() === addr;
    if (isIn) {
      txGroups[txHash].ins.push(t);
    } else {
      txGroups[txHash].outs.push(t);
    }
  }

  for (const itx of internalTxs) {
    if (itx.to?.hash?.toLowerCase() === addr && itx.value && itx.value !== "0") {
      const txHash = itx.transaction_hash;
      if (!txGroups[txHash]) txGroups[txHash] = { ins: [], outs: [], ethIn: 0, timestamp: itx.timestamp };
      txGroups[txHash].ethIn += bigIntToDecimal(itx.value, 18);
      if (!txGroups[txHash].timestamp && itx.timestamp) {
        txGroups[txHash].timestamp = itx.timestamp;
      }
    }
  }

  for (const [txHash, group] of Object.entries(txGroups)) {
    const stableOut = group.outs.find((o: any) => {
      const s = o.token?.symbol;
      return s === "USDC" || s === "USDT" || s === "DAI" || s === "USDC.E";
    });

    for (const inTransfer of group.ins) {
      const symbol = inTransfer.token?.symbol;
      if (!symbol) continue;

      if (stableOut) {
        const stableDecimals = parseInt(stableOut.total?.decimals || "6");
        const stableAmount = bigIntToDecimal(stableOut.total?.value || "0", stableDecimals);
        const tokenDecimals = parseInt(inTransfer.total?.decimals || "18");
        const tokenAmount = bigIntToDecimal(inTransfer.total?.value || "0", tokenDecimals);

        if (tokenAmount > 0) {
          const pricePerToken = stableAmount / tokenAmount;
          acquisitions[symbol] = {
            costBasis: pricePerToken,
            acquiredAt: inTransfer.timestamp,
            txHash,
          };
        }
      }
    }

    if (group.ethIn > 0 && stableOut && group.ins.length === 0) {
      const stableDecimals = parseInt(stableOut.total?.decimals || "6");
      const stableAmount = bigIntToDecimal(stableOut.total?.value || "0", stableDecimals);
      if (group.ethIn > 0) {
        acquisitions["ETH"] = {
          costBasis: stableAmount / group.ethIn,
          acquiredAt: group.timestamp,
          txHash,
        };
      }
    }
  }

  return acquisitions;
}

async function fetchChainHoldings(
  chain: "ethereum" | "gnosis",
  blockscoutBase: string,
  address: string
): Promise<any[]> {
  const [tokens, nativeBalance, transfers, internalTxs] = await Promise.all([
    fetchTokensFromBlockscout(blockscoutBase, address),
    fetchNativeBalance(blockscoutBase, address),
    fetchTokenTransfers(blockscoutBase, address).catch(() => []),
    fetchInternalTransactions(blockscoutBase, address),
  ]);

  const acquisitions = buildAcquisitionData(transfers, internalTxs, address);
  const holdings: any[] = [];
  let colorIdx = 0;

  const nativeBal = bigIntToDecimal(nativeBalance, 18);
  if (nativeBal > 0.00001) {
    if (chain === "ethereum") {
      const ethPriceRes = await fetch(
        `https://coins.llama.fi/prices/current/coingecko:ethereum`,
        { signal: AbortSignal.timeout(8000) }
      );
      let ethPrice = 0;
      if (ethPriceRes.ok) {
        const ethData = await ethPriceRes.json();
        ethPrice = ethData.coins?.["coingecko:ethereum"]?.price || 0;
      }
      holdings.push({
        symbol: "ETH",
        name: "Ether",
        address: "native",
        balance: nativeBal,
        price: ethPrice,
        valueUsd: nativeBal * ethPrice,
        color: TOKEN_COLORS.ETH,
        iconUrl: "/eth-logo.png",
        chain,
        walletAddress: address,
        acquisitionPrice: acquisitions["ETH"]?.costBasis || null,
        acquiredAt: acquisitions["ETH"]?.acquiredAt || null,
      });
    } else {
      holdings.push({
        symbol: "xDAI",
        name: "xDAI",
        address: "native",
        balance: nativeBal,
        price: 1,
        valueUsd: nativeBal,
        color: TOKEN_COLORS.xDAI,
        iconUrl: null,
        chain,
        walletAddress: address,
        acquisitionPrice: null,
        acquiredAt: null,
      });
    }
  }

  const GNOSIS_KNOWN_TOKENS = ["USDC.E", "SDAI", "USDC", "USDT", "DAI", "WETH", "GNO", "WXDAI", "S-CRC", "XDAI"];

  const validTokens = tokens.filter((t: any) => {
    const hasBalance = t.value && t.value !== "0";
    if (!hasBalance) return false;
    const symbol = t.token?.symbol || "";
    const hasPrice = t.token?.exchange_rate && parseFloat(t.token.exchange_rate) > 0;
    if (chain === "gnosis") {
      return hasPrice || GNOSIS_KNOWN_TOKENS.includes(symbol.toUpperCase());
    }
    return hasPrice;
  });

  const llamaPrefix = chain === "ethereum" ? "ethereum" : "gnosis";
  const llamaIds = validTokens
    .map((t: any) => `${llamaPrefix}:${t.token?.address_hash}`)
    .join(",");

  let llamaPrices: Record<string, number> = {};
  if (llamaIds) {
    try {
      const res = await fetch(
        `https://coins.llama.fi/prices/current/${llamaIds}`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (res.ok) {
        const data = await res.json();
        for (const [key, val] of Object.entries(data.coins || {})) {
          llamaPrices[key] = (val as any).price || 0;
        }
      }
    } catch {}
  }

  for (const token of validTokens) {
    const symbol = token.token?.symbol || "???";
    const decimals = parseInt(token.token?.decimals || "18");
    const balance = bigIntToDecimal(token.value || "0", decimals);
    const tokenAddress = token.token?.address_hash?.toLowerCase();
    const llamaKey = `${llamaPrefix}:${tokenAddress}`;
    const price = llamaPrices[llamaKey] || parseFloat(token.token?.exchange_rate || "0");

    if (price === 0 && !GNOSIS_KNOWN_TOKENS.includes(symbol.toUpperCase())) continue;

    const valueUsd = balance * price;
    const color = TOKEN_COLORS[symbol] || TOKEN_COLORS[symbol.toUpperCase()] || DEFAULT_COLORS[colorIdx % DEFAULT_COLORS.length];
    colorIdx++;

    let iconUrl = token.token?.icon_url || null;
    if (symbol === "WETH" || symbol === "ETH") {
      iconUrl = "/eth-logo.png";
    }

    holdings.push({
      symbol,
      name: token.token?.name || symbol,
      address: tokenAddress,
      balance,
      price,
      valueUsd,
      color,
      iconUrl,
      chain,
      walletAddress: address,
      acquisitionPrice: acquisitions[symbol]?.costBasis || null,
      acquiredAt: acquisitions[symbol]?.acquiredAt || null,
    });
  }

  return holdings;
}

export async function GET() {
  try {
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json(cached.data);
    }

    const [ethHoldings, gnosisHoldings] = await Promise.all([
      fetchChainHoldings("ethereum", ETH_BLOCKSCOUT, ETH_TREASURY_ADDRESS).catch((err) => {
        console.error("Ethereum treasury fetch error:", err.message);
        return [];
      }),
      fetchChainHoldings("gnosis", GNOSIS_BLOCKSCOUT, GNOSIS_TREASURY_ADDRESS).catch((err) => {
        console.error("Gnosis treasury fetch error:", err.message);
        return [];
      }),
    ]);

    const holdings = [...ethHoldings, ...gnosisHoldings];
    holdings.sort((a, b) => b.valueUsd - a.valueUsd);

    const totalUsd = holdings.reduce((sum, h) => sum + h.valueUsd, 0);
    const trackedHoldings = holdings.filter((h) => h.acquisitionPrice && h.balance);
    const totalCostBasis = trackedHoldings.reduce((sum, h) => sum + h.acquisitionPrice * h.balance, 0);
    const trackedCurrentValue = trackedHoldings.reduce((sum, h) => sum + h.valueUsd, 0);

    const result = {
      addresses: {
        ethereum: ETH_TREASURY_ADDRESS,
        gnosis: GNOSIS_TREASURY_ADDRESS,
      },
      address: ETH_TREASURY_ADDRESS,
      chain: "multi",
      holdings,
      totalUsd,
      totalCostBasis,
      totalPnl: totalCostBasis > 0 ? trackedCurrentValue - totalCostBasis : null,
      totalPnlPercent: totalCostBasis > 0 ? ((trackedCurrentValue - totalCostBasis) / totalCostBasis) * 100 : null,
      trackedTokens: trackedHoldings.length,
      totalTokens: holdings.length,
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
