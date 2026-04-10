export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";

const GNOSIS_RPC_URL = "https://rpc.gnosis.gateway.fm";
const CIRCLES_HUB = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const TRANSFER_SINGLE = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const STREAM_COMPLETED = "0xcfe53a731d24ac31b725405f3dca8a4d23512d3e1ade2359fbbe7982bec0fd42";
const START_BLOCK = "0x2B7DA79";

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

    return NextResponse.json({
      streamCount: streamLogs.length,
      transferCount: transferLogs.length,
      streamTxs: streamLogs.map((l: any) => l.transactionHash?.slice(0, 15)),
      transferTxs: transferLogs.map((l: any) => l.transactionHash?.slice(0, 15)),
      streamError: streams.error || null,
      transferError: transfers.error || null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
