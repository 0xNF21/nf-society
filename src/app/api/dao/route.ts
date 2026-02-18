import { NextRequest, NextResponse } from "next/server";
import { CirclesRpc } from "@aboutcircles/sdk-rpc";

const CIRCLES_RPC_URL = process.env.NEXT_PUBLIC_CIRCLES_RPC_URL || "https://rpc.aboutcircles.com/";
const GNOSIS_RPC = "https://rpc.gnosischain.com";
const NF_GROUP_ADDRESS = "0x7dd9f44c7f1a6788221a92305f9e7ea790675e9b";
const NF_TREASURY_ADDRESS = "0xbf57dc790ba892590c640dc27b26b2665d30104f";
const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

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

    const { contributions, totalBurned, recentTxs } = await getContributions(rpc);

    const memberSetForContribs = new Set(members);
    for (const c of contributions) {
      c.isMember = memberSetForContribs.has(c.address);
    }

    const now = Date.now();
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    const oneMonthMs = 30 * 24 * 60 * 60 * 1000;
    const twoMonthsMs = 60 * 24 * 60 * 60 * 1000;
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    const contributorMap: Record<string, { totalCRC: number; lastContributionTs: number }> = {};
    for (const c of contributions) {
      contributorMap[c.address] = {
        totalCRC: c.totalCRC,
        lastContributionTs: c.lastContributionTs,
      };
    }

    const allAffiliates = [...new Set([...members, ...contributions.map((c) => c.address)])];

    const inactive: {
      fiveDays: string[];
      twoWeeks: string[];
      oneMonth: string[];
      twoMonths: string[];
      never: string[];
    } = { fiveDays: [], twoWeeks: [], oneMonth: [], twoMonths: [], never: [] };

    for (const addr of allAffiliates) {
      const contrib = contributorMap[addr];
      if (!contrib || contrib.lastContributionTs === 0) {
        inactive.never.push(addr);
        continue;
      }
      const lastTs = contrib.lastContributionTs * 1000;
      const elapsed = now - lastTs;
      if (elapsed > twoMonthsMs) {
        inactive.twoMonths.push(addr);
      } else if (elapsed > oneMonthMs) {
        inactive.oneMonth.push(addr);
      } else if (elapsed > twoWeeksMs) {
        inactive.twoWeeks.push(addr);
      } else if (elapsed > fiveDaysMs) {
        inactive.fiveDays.push(addr);
      }
    }

    const weekAgo = (now - oneWeekMs) / 1000;
    const weeklyContributions = contributions
      .filter((c) => c.lastContributionTs >= weekAgo)
      .map((c) => {
        const weeklyAmount = recentTxs
          .filter((tx) => tx.from === c.address && tx.ts >= weekAgo)
          .reduce((sum, tx) => sum + tx.amount, 0);
        return { address: c.address, weeklyCRC: Math.round(weeklyAmount * 100) / 100, isMember: c.isMember };
      })
      .filter((c) => c.weeklyCRC > 0)
      .sort((a, b) => b.weeklyCRC - a.weeklyCRC);

    const latestClaims = recentTxs
      .filter((tx) => tx.to === NF_TREASURY_ADDRESS.toLowerCase())
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 50)
      .map((tx) => ({
        address: tx.from,
        amount: Math.round(tx.amount * 100) / 100,
        timestamp: tx.ts,
      }));

    const fiveDaysAgoTs = (now - fiveDaysMs) / 1000;
    const activeAffiliates5d = contributions.filter(
      (c) => c.lastContributionTs >= fiveDaysAgoTs
    ).length;

    return NextResponse.json({
      groupAddress: NF_GROUP_ADDRESS,
      treasuryAddress: NF_TREASURY_ADDRESS,
      members,
      memberTrust,
      contributions,
      allAffiliates,
      inactive,
      totalBurned: Math.round(totalBurned * 100) / 100,
      weeklyContributions,
      latestClaims,
      totalMembers: members.length,
      totalAffiliates: allAffiliates.length,
      activeAffiliates5d,
      fetchedAt: Date.now(),
    });
  } catch (error: any) {
    console.error("DAO API error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch DAO data" },
      { status: 500 }
    );
  }
}

type TxRecord = { from: string; to: string; amount: number; ts: number };

async function getContributions(rpc: CirclesRpc): Promise<{
  contributions: Array<{
    address: string;
    totalCRC: number;
    lastContributionTs: number;
    isMember: boolean;
  }>;
  totalBurned: number;
  recentTxs: TxRecord[];
}> {
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
      const contribMap: Record<string, { total: number; lastTs: number }> = {};
      let totalBurned = 0;
      const recentTxs: TxRecord[] = [];

      for (const tx of allTx) {
        const from = (tx.from || "").toLowerCase();
        const to = (tx.to || "").toLowerCase();

        const amount = Math.abs(typeof tx.circles === "number" ? tx.circles : parseFloat(String(tx.circles || "0")));
        if (amount === 0) continue;

        const ts = parseInt(tx.timestamp?.toString() || "0") || 0;

        if (to === NULL_ADDRESS) {
          totalBurned += amount;
          continue;
        }

        if (from === NULL_ADDRESS) {
          continue;
        }

        if (to === NF_TREASURY_ADDRESS) {
          recentTxs.push({ from, to, amount, ts });

          if (!contribMap[from]) {
            contribMap[from] = { total: 0, lastTs: 0 };
          }
          contribMap[from].total += amount;
          if (ts > contribMap[from].lastTs) {
            contribMap[from].lastTs = ts;
          }
        }
      }

      const results = Object.entries(contribMap)
        .map(([address, d]) => ({
          address,
          totalCRC: Math.round(d.total * 100) / 100,
          lastContributionTs: d.lastTs,
          isMember: false,
        }))
        .sort((a, b) => b.totalCRC - a.totalCRC);

      if (results.length > 0) return { contributions: results, totalBurned, recentTxs };
    }
  } catch (e) {
    console.error("Error fetching contributions from SDK:", e);
  }

  const contributions = await getContributionsFromChain();
  return { contributions, totalBurned: 0, recentTxs: [] };
}

async function getContributionsFromChain(): Promise<Array<{
  address: string;
  totalCRC: number;
  lastContributionTs: number;
  isMember: boolean;
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

  const contribMap: Record<string, { total: bigint; lastTs: number }> = {};
  for (const log of logs) {
    const from = "0x" + log.topics[2].slice(26).toLowerCase();
    const dataHex = log.data || "0x";
    const valueHex = dataHex.length >= 130 ? "0x" + dataHex.slice(66, 130) : "0x0";
    const value = BigInt(valueHex);
    const ts = blockTimestamps[log.blockNumber] || 0;

    if (!contribMap[from]) {
      contribMap[from] = { total: 0n, lastTs: 0 };
    }
    contribMap[from].total += value;
    if (ts > contribMap[from].lastTs) contribMap[from].lastTs = ts;
  }

  return Object.entries(contribMap)
    .map(([address, d]) => ({
      address,
      totalCRC: Math.round(Number(d.total * 100n / BigInt(10 ** 18))) / 100,
      lastContributionTs: d.lastTs,
      isMember: false,
    }))
    .sort((a, b) => b.totalCRC - a.totalCRC);
}
