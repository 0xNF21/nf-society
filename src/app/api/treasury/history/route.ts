import { NextResponse } from "next/server";

const TREASURY_ADDRESS = "0x2f233f212fe999edcdd300478dbddff5b609510a";
const BLOCKSCOUT_BASE = "https://eth.blockscout.com/api/v2";
const CRC_POOL_ADDRESS = "0x582f85e3fdd6efe0ccf71d1fa6b1b87d8e64ce7d";
const GECKO_TERMINAL_BASE = "https://api.geckoterminal.com/api/v2";

let historyCache: { data: any; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

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

export async function GET() {
  try {
    if (historyCache && Date.now() - historyCache.fetchedAt < CACHE_TTL_MS) {
      return NextResponse.json(historyCache.data);
    }

    let acquisitionDates: Record<string, number> = {};
    try {
      const treasuryRes = await fetch(
        `http://localhost:5000/api/treasury`,
        { signal: AbortSignal.timeout(30000) }
      );
      if (treasuryRes.ok) {
        const treasuryData = await treasuryRes.json();
        for (const h of treasuryData.holdings || []) {
          if (h.acquiredAt) {
            acquisitionDates[h.symbol] = Math.floor(new Date(h.acquiredAt).getTime() / 1000);
          }
        }
      }
    } catch {}

    let crcBalance = 0;
    try {
      const daoRes = await fetch(`http://localhost:5000/api/dao`, { signal: AbortSignal.timeout(30000) });
      if (daoRes.ok) {
        const daoData = await daoRes.json();
        crcBalance = (daoData.contributions || []).reduce((sum: number, c: any) => sum + (c.totalCRC || 0), 0);
      }
    } catch {}

    let crcOhlcv: Array<[number, number, number, number, number, number]> = [];
    try {
      const ohlcvRes = await fetch(
        `${GECKO_TERMINAL_BASE}/networks/xdai/pools/${CRC_POOL_ADDRESS}/ohlcv/day?limit=365&aggregate=1`,
        { signal: AbortSignal.timeout(10000) }
      );
      if (ohlcvRes.ok) {
        const ohlcvData = await ohlcvRes.json();
        crcOhlcv = ohlcvData.data?.attributes?.ohlcv_list || [];
      }
    } catch {}

    const [tokensRes, ethBalRes] = await Promise.all([
      fetch(`${BLOCKSCOUT_BASE}/addresses/${TREASURY_ADDRESS}/token-balances`, { signal: AbortSignal.timeout(15000) }),
      fetch(`${BLOCKSCOUT_BASE}/addresses/${TREASURY_ADDRESS}`, { signal: AbortSignal.timeout(15000) }),
    ]);

    if (!tokensRes.ok) throw new Error("Failed to fetch token balances");
    const blockscoutTokens = await tokensRes.json();
    const tokens = Array.isArray(blockscoutTokens) ? blockscoutTokens : (blockscoutTokens.items || []);

    let ethBalance = 0;
    if (ethBalRes.ok) {
      const ethData = await ethBalRes.json();
      const rawEth = ethData.coin_balance || "0";
      ethBalance = bigIntToDecimal(rawEth, 18);
    }

    const validTokens = tokens.filter((t: any) => {
      const hasPrice = t.token?.exchange_rate && parseFloat(t.token.exchange_rate) > 0;
      const hasBalance = t.value && t.value !== "0";
      return hasPrice && hasBalance;
    });

    const llamaKeys: string[] = [];
    const tokenSymbols: Record<string, string> = {};
    const tokenBalances: Record<string, number> = {};

    for (const t of validTokens) {
      const addr = t.token?.address_hash?.toLowerCase();
      const symbol = t.token?.symbol || "???";
      const decimals = parseInt(t.token?.decimals || "18");
      const balance = bigIntToDecimal(t.value || "0", decimals);
      tokenSymbols[`ethereum:${addr}`] = symbol;
      tokenBalances[`ethereum:${addr}`] = balance;
      llamaKeys.push(`ethereum:${addr}`);
    }

    if (ethBalance > 0) {
      const ethKey = "coingecko:ethereum";
      tokenSymbols[ethKey] = "ETH";
      tokenBalances[ethKey] = ethBalance;
      llamaKeys.push(ethKey);
    }

    const now = Math.floor(Date.now() / 1000);
    const periods: Record<string, number> = {
      "24h": now - 86400,
      "7d": now - 7 * 86400,
      "30d": now - 30 * 86400,
      "1y": now - 365 * 86400,
    };

    const earliestAcquisition = Object.values(acquisitionDates).length > 0
      ? Math.min(...Object.values(acquisitionDates))
      : 0;

    const allIds = llamaKeys.join(",");
    let currentPrices: Record<string, number> = {};
    try {
      const res = await fetch(`https://coins.llama.fi/prices/current/${allIds}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        for (const [key, val] of Object.entries(data.coins || {})) {
          currentPrices[key] = (val as any).price || 0;
        }
      }
    } catch {}

    const crcCurrentPrice = crcOhlcv.length > 0 ? crcOhlcv[0][3] : 0;
    const crcCurrentValueUsd = crcBalance * crcCurrentPrice;

    let currentTotalUsd = 0;
    for (const key of llamaKeys) {
      const price = currentPrices[key] || 0;
      currentTotalUsd += tokenBalances[key] * price;
    }
    currentTotalUsd += crcCurrentValueUsd;

    const crcOldestTimestamp = crcOhlcv.length > 0 ? crcOhlcv[crcOhlcv.length - 1][0] : 0;

    function getCrcPriceAtTimestamp(ts: number): number | null {
      if (crcOhlcv.length === 0) return null;
      if (ts < crcOldestTimestamp) return null;
      for (const candle of crcOhlcv) {
        if (candle[0] <= ts) {
          return candle[3];
        }
      }
      return null;
    }

    const performance: Record<string, { totalUsd: number; currentTotalUsd: number; changePercent: number }> = {};

    const periodFetches = Object.entries(periods).map(async ([period, timestamp]) => {
      const effectiveTimestamp = earliestAcquisition > 0 && timestamp < earliestAcquisition
        ? earliestAcquisition
        : timestamp;

      try {
        const res = await fetch(
          `https://coins.llama.fi/prices/historical/${effectiveTimestamp}/${allIds}`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (res.ok) {
          const data = await res.json();
          let historicalTotalUsd = 0;
          for (const key of llamaKeys) {
            const historicalPrice = (data.coins?.[key] as any)?.price || 0;
            historicalTotalUsd += tokenBalances[key] * historicalPrice;
          }
          const crcHistoricalPrice = getCrcPriceAtTimestamp(timestamp);
          if (crcHistoricalPrice !== null) {
            historicalTotalUsd += crcBalance * crcHistoricalPrice;
          }

          if (historicalTotalUsd > 0) {
            performance[period] = {
              totalUsd: historicalTotalUsd,
              currentTotalUsd,
              changePercent: ((currentTotalUsd - historicalTotalUsd) / historicalTotalUsd) * 100,
            };
          }
        }
      } catch {}
    });

    await Promise.all(periodFetches);

    performance["all"] = performance["1y"] || performance["30d"] || { totalUsd: currentTotalUsd, currentTotalUsd, changePercent: 0 };

    const perToken: Record<string, Record<string, number>> = {};
    for (const key of llamaKeys) {
      const symbol = tokenSymbols[key];
      const currentPrice = currentPrices[key] || 0;
      if (!currentPrice) continue;
      perToken[symbol] = {};
      const tokenAcqTime = acquisitionDates[symbol] || 0;

      const tokenPeriodFetches = Object.entries(periods).map(async ([period, timestamp]) => {
        const effectiveTimestamp = tokenAcqTime > 0 && timestamp < tokenAcqTime
          ? tokenAcqTime
          : timestamp;

        try {
          const res = await fetch(
            `https://coins.llama.fi/prices/historical/${effectiveTimestamp}/${key}`,
            { signal: AbortSignal.timeout(8000) }
          );
          if (res.ok) {
            const data = await res.json();
            const historicalPrice = (data.coins?.[key] as any)?.price || 0;
            if (historicalPrice > 0) {
              perToken[symbol][period] = ((currentPrice - historicalPrice) / historicalPrice) * 100;
            }
          }
        } catch {}
      });

      await Promise.all(tokenPeriodFetches);

      if (perToken[symbol]["1y"] !== undefined) {
        perToken[symbol]["all"] = perToken[symbol]["1y"];
      } else if (perToken[symbol]["30d"] !== undefined) {
        perToken[symbol]["all"] = perToken[symbol]["30d"];
      }
    }

    if (crcCurrentPrice > 0 && crcOhlcv.length > 0) {
      perToken["CRC"] = {};
      for (const [period, timestamp] of Object.entries(periods)) {
        const historicalCrcPrice = getCrcPriceAtTimestamp(timestamp);
        if (historicalCrcPrice !== null && historicalCrcPrice > 0) {
          perToken["CRC"][period] = ((crcCurrentPrice - historicalCrcPrice) / historicalCrcPrice) * 100;
        }
      }
      if (perToken["CRC"]["1y"] !== undefined) {
        perToken["CRC"]["all"] = perToken["CRC"]["1y"];
      } else if (perToken["CRC"]["30d"] !== undefined) {
        perToken["CRC"]["all"] = perToken["CRC"]["30d"];
      }
    }

    const result = {
      currentTotalUsd,
      performance,
      perToken,
      acquisitionDates,
      crcBalance,
      crcCurrentPrice,
      crcCurrentValueUsd,
      fetchedAt: Date.now(),
    };

    historyCache = { data: result, fetchedAt: Date.now() };
    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Treasury history API error:", error.message);
    if (historyCache) return NextResponse.json(historyCache.data);
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
