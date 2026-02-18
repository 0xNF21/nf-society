import { NextRequest, NextResponse } from "next/server";
import { CirclesRpc } from "@aboutcircles/sdk-rpc";

const CIRCLES_RPC_URL = process.env.NEXT_PUBLIC_CIRCLES_RPC_URL || "https://rpc.aboutcircles.com/";
const GNOSIS_RPC = "https://rpc.gnosischain.com";
const NF_GROUP_ADDRESS = "0x7dd9f44c7f1a6788221a92305f9e7ea790675e9b";
const NF_TREASURY_ADDRESS = "0xbf57dc790ba892590c640dc27b26b2665d30104f";

function getRpc() {
  return new CirclesRpc(CIRCLES_RPC_URL);
}

async function gnosisRpc(method: string, params: any[]) {
  const res = await fetch(GNOSIS_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  return data.result;
}

export async function GET(req: NextRequest) {
  try {
    const rpc = getRpc();

    const trustRelations = await rpc.trust.getAggregatedTrustRelations(NF_GROUP_ADDRESS);

    const trustedByGroup: string[] = [];
    const trustsGroup: string[] = [];

    for (const rel of trustRelations) {
      const subject = (rel.subjectAvatar || "").toLowerCase();
      const object = (rel.objectAvatar || "").toLowerCase();
      const relation = rel.relation || "";

      if (subject === NF_GROUP_ADDRESS) {
        if (relation === "trusts" || relation === "mutuallyTrusts") {
          trustedByGroup.push(object);
        }
        if (relation === "trustedBy" || relation === "mutuallyTrusts") {
          trustsGroup.push(object);
        }
      }
    }

    const members = [...new Set([...trustedByGroup, ...trustsGroup])];

    const memberTrust: Record<string, { trustedByGroup: boolean; trustsGroup: boolean }> = {};
    for (const addr of members) {
      memberTrust[addr] = {
        trustedByGroup: trustedByGroup.includes(addr),
        trustsGroup: trustsGroup.includes(addr),
      };
    }

    let memberRelations: Array<{ from: string; to: string }> = [];
    try {
      const memberSet = new Set(members);
      for (const member of members) {
        const rels = await rpc.trust.getAggregatedTrustRelations(member);
        for (const rel of rels) {
          const other = (rel.objectAvatar || "").toLowerCase();
          if (memberSet.has(other) && other !== NF_GROUP_ADDRESS && other !== member) {
            const relation = rel.relation || "";
            if (relation === "trusts" || relation === "mutuallyTrusts") {
              memberRelations.push({ from: member, to: other });
            }
          }
        }
      }
    } catch (e) {
      console.error("Error fetching member relations:", e);
    }

    let contributions: Array<{ address: string; totalAmount: number; lastContribution: string; count: number }> = [];
    try {
      const txQuery = rpc.transaction.getTransactionHistory(NF_TREASURY_ADDRESS, 100);
      let hasMore = await txQuery.queryNextPage();
      const allTx: any[] = [];

      while (hasMore) {
        if (txQuery.currentPage?.results) {
          allTx.push(...txQuery.currentPage.results);
        }
        hasMore = await txQuery.queryNextPage();
      }

      if (allTx.length > 0) {
        const contribMap: Record<string, { total: number; last: string; count: number }> = {};

        for (const tx of allTx) {
          const from = (tx.from || "").toLowerCase();
          const to = (tx.to || "").toLowerCase();
          if (to !== NF_TREASURY_ADDRESS) continue;

          const amount = parseFloat(tx.timeCircles || "0");

          if (!contribMap[from]) {
            contribMap[from] = { total: 0, last: "", count: 0 };
          }
          contribMap[from].total += amount;
          contribMap[from].count += 1;
          const ts = tx.timestamp?.toString() || "";
          if (ts > contribMap[from].last) {
            contribMap[from].last = ts;
          }
        }

        contributions = Object.entries(contribMap)
          .map(([address, d]) => ({
            address,
            totalAmount: Math.round(d.total * 100) / 100,
            lastContribution: d.last,
            count: d.count,
          }))
          .sort((a, b) => b.count - a.count);
      }

      if (contributions.length === 0) {
        contributions = await getContributionsFromChain();
      }
    } catch (e) {
      console.error("Error fetching contributions:", e);
      try {
        contributions = await getContributionsFromChain();
      } catch (e2) {
        console.error("Fallback chain contributions also failed:", e2);
      }
    }

    return NextResponse.json({
      groupAddress: NF_GROUP_ADDRESS,
      treasuryAddress: NF_TREASURY_ADDRESS,
      members,
      memberTrust,
      memberRelations,
      contributions,
      totalMembers: members.length,
    });
  } catch (error: any) {
    console.error("DAO API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch DAO data" },
      { status: 500 }
    );
  }
}

async function getContributionsFromChain(): Promise<Array<{
  address: string;
  totalAmount: number;
  lastContribution: string;
  count: number;
}>> {
  const transferTopic = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
  const treasuryPadded = "0x" + NF_TREASURY_ADDRESS.slice(2).padStart(64, "0");

  const logs = await gnosisRpc("eth_getLogs", [{
    fromBlock: "0x2500000",
    toBlock: "latest",
    topics: [transferTopic, null, null, treasuryPadded],
  }]);

  if (!logs || !Array.isArray(logs) || logs.length === 0) return [];

  const blockNumbers = [...new Set(logs.map((l: any) => l.blockNumber))] as string[];
  const blockTimestamps: Record<string, number> = {};

  const batchSize = 20;
  for (let i = 0; i < blockNumbers.length; i += batchSize) {
    const batch = blockNumbers.slice(i, i + batchSize);
    const requests = batch.map((bn: string, idx: number) => ({
      jsonrpc: "2.0", id: idx + i, method: "eth_getBlockByNumber", params: [bn, false],
    }));
    const res = await fetch(GNOSIS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requests),
      signal: AbortSignal.timeout(10000),
    });
    const results = await res.json();
    for (const r of results) {
      if (r.result?.timestamp) {
        blockTimestamps[r.result.number] = parseInt(r.result.timestamp, 16);
      }
    }
  }

  const contribMap: Record<string, { total: bigint; last: number; count: number }> = {};
  for (const log of logs) {
    const from = "0x" + log.topics[2].slice(26).toLowerCase();
    const dataHex = log.data || "0x";
    const valueHex = dataHex.length >= 130 ? "0x" + dataHex.slice(66, 130) : "0x0";
    const value = BigInt(valueHex);
    const ts = blockTimestamps[log.blockNumber] || 0;

    if (!contribMap[from]) {
      contribMap[from] = { total: 0n, last: 0, count: 0 };
    }
    contribMap[from].total += value;
    contribMap[from].count += 1;
    if (ts > contribMap[from].last) contribMap[from].last = ts;
  }

  return Object.entries(contribMap)
    .map(([address, d]) => ({
      address,
      totalAmount: Number(d.total / BigInt(10 ** 18)),
      lastContribution: d.last > 0 ? new Date(d.last * 1000).toISOString() : "",
      count: d.count,
    }))
    .sort((a, b) => b.count - a.count);
}
