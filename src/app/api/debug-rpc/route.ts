export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

const GNOSIS_RPC_URL = "https://rpc.gnosis.gateway.fm";
const CIRCLES_HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const TRANSFER_SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const STREAM_COMPLETED = "0xcfe53a731d24ac31b725405f3dca8a4d23512d3e1ade2359fbbe7982bec0fd42";
const START_BLOCK = "0x2B7DA79";
const WEI = BigInt("1000000000000000000");

function parseStreamData(data: string): bigint {
  const d = data.slice(2);
  if (d.length < 192) return 0n;
  const offset2 = parseInt(d.slice(64, 128), 16) * 2;
  const arrayLen = parseInt(d.slice(offset2, offset2 + 64), 16);
  let total = 0n;
  for (let i = 0; i < arrayLen; i++) {
    total += BigInt("0x" + d.slice(offset2 + 64 + i * 64, offset2 + 128 + i * 64));
  }
  return total;
}

export async function GET() {
  const recipient = "0x960a0784640fd6581d221a56df1c60b65b5ebb6f";
  const padded = "0x" + recipient.replace("0x", "").padStart(64, "0");

  try {
    const [streamsRes, transfersRes] = await Promise.all([
      fetch(GNOSIS_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getLogs", params: [{ fromBlock: START_BLOCK, toBlock: "latest", address: CIRCLES_HUB, topics: [STREAM_COMPLETED, null, null, padded] }] }),
      }),
      fetch(GNOSIS_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "eth_getLogs", params: [{ fromBlock: START_BLOCK, toBlock: "latest", address: CIRCLES_HUB, topics: [TRANSFER_SINGLE, null, null, padded] }] }),
      }),
    ]);

    const streams = await streamsRes.json();
    const transfers = await transfersRes.json();
    const streamLogs = Array.isArray(streams.result) ? streams.result : [];
    const transferLogs = Array.isArray(transfers.result) ? transfers.result : [];

    // Simulate exact deduplicateEvents logic
    const seenTxHashes = new Set<string>();
    const results: any[] = [];
    const trace: string[] = [];

    // 1. Streams
    for (const log of streamLogs) {
      const val = parseStreamData(log.data || "0x");
      const txKey = (log.transactionHash || "").toLowerCase();
      if (val !== WEI) { trace.push(`stream SKIP wrong_amount tx=${txKey.slice(0,15)} val=${val}`); continue; }
      if (seenTxHashes.has(txKey)) { trace.push(`stream SKIP dup tx=${txKey.slice(0,15)}`); continue; }
      seenTxHashes.add(txKey);
      results.push({ tx: txKey.slice(0, 15), source: "stream" });
      trace.push(`stream ADDED tx=${txKey.slice(0,15)}`);
    }

    // 2. Transfers (aggregated by tx)
    const txMap = new Map<string, bigint>();
    for (const log of transferLogs) {
      const txKey = (log.transactionHash || "").toLowerCase();
      const to = "0x" + (log.topics?.[3] || "").slice(26);
      if (to.toLowerCase() !== recipient) { trace.push(`transfer SKIP wrong_to tx=${txKey.slice(0,15)} to=${to.slice(0,10)}`); continue; }
      const valueHex = (log.data || "0x").length >= 130 ? "0x" + (log.data || "0x").slice(66, 130) : "0x0";
      const val = BigInt(valueHex);
      txMap.set(txKey, (txMap.get(txKey) || 0n) + val);
    }

    for (const [txKey, total] of txMap) {
      if (seenTxHashes.has(txKey)) { trace.push(`transfer SKIP seen tx=${txKey.slice(0,15)}`); continue; }
      if (total !== WEI) { trace.push(`transfer SKIP wrong_amount tx=${txKey.slice(0,15)} total=${total}`); continue; }
      seenTxHashes.add(txKey);
      results.push({ tx: txKey.slice(0, 15), source: "transfer" });
      trace.push(`transfer ADDED tx=${txKey.slice(0,15)}`);
    }

    // Also call the real checkAllNewPayments to compare
    let realResult: any = null;
    try {
      const { checkAllNewPayments } = await import("@/lib/circles");
      const payments = await checkAllNewPayments(1, "0x960A0784640fD6581D221A56df1c60b65b5ebB6f");
      realResult = { count: payments.length, txs: payments.map(p => p.transactionHash.slice(0, 15)) };
    } catch (err: any) {
      realResult = { error: err.message };
    }

    return NextResponse.json({
      streamCount: streamLogs.length,
      transferCount: transferLogs.length,
      resultCount: results.length,
      results,
      trace,
      realCheckAllNewPayments: realResult,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
