import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { exchanges } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { ethers } from "ethers";
import { getPayoutConfig, getSafeCrcBalance } from "@/lib/payout";

export const dynamic = "force-dynamic";

const GNOSIS_RPC_URL = "https://rpc.gnosis.gateway.fm";
const CIRCLES_HUB_ADDRESS = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const STREAM_COMPLETED_TOPIC = "0xcfe53a731d24ac31b725405f3dca8a4d23512d3e1ade2359fbbe7982bec0fd42";
const TRANSFER_SINGLE_TOPIC = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const EXCHANGE_START_BLOCK = "0x2B00000";

const SAFE_ADDRESS = process.env.SAFE_ADDRESS || "";
const NF_CRC_ERC20_WRAPPER = "0x734fb1c312dba2baa442e7d9ce55fd7a59c4e9ee";

const ROLES_MOD_ABI = [
  "function execTransactionWithRole(address to, uint256 value, bytes data, uint8 operation, uint16 roleId, bool shouldRevert) external returns (bool success)",
];
const ERC20_WRAPPER_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
];

function padAddress(addr: string): string {
  const clean = addr.toLowerCase().replace("0x", "");
  return "0x" + clean.padStart(64, "0");
}

function parseStreamCompletedData(data: string): bigint {
  const dataClean = data.slice(2);
  if (dataClean.length < 192) return 0n;
  const offset2 = parseInt(dataClean.slice(64, 128), 16) * 2;
  const arrayLen = parseInt(dataClean.slice(offset2, offset2 + 64), 16);
  let totalAmount = 0n;
  for (let i = 0; i < arrayLen; i++) {
    const start = offset2 + 64 + i * 64;
    totalAmount += BigInt("0x" + dataClean.slice(start, start + 64));
  }
  return totalAmount;
}

type IncomingPayment = {
  txHash: string;
  sender: string;
  amount: bigint;
  blockNumber: string;
};

async function scanIncomingPayments(): Promise<IncomingPayment[]> {
  if (!SAFE_ADDRESS) return [];
  const paddedSafe = padAddress(SAFE_ADDRESS);

  const [streamRes, transferRes] = await Promise.all([
    fetch(GNOSIS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_getLogs",
        params: [{ fromBlock: EXCHANGE_START_BLOCK, toBlock: "latest", address: CIRCLES_HUB_ADDRESS, topics: [STREAM_COMPLETED_TOPIC, null, null, paddedSafe] }],
      }),
      signal: AbortSignal.timeout(15000),
    }),
    fetch(GNOSIS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "eth_getLogs",
        params: [{ fromBlock: EXCHANGE_START_BLOCK, toBlock: "latest", address: CIRCLES_HUB_ADDRESS, topics: [TRANSFER_SINGLE_TOPIC, null, null, paddedSafe] }],
      }),
      signal: AbortSignal.timeout(15000),
    }),
  ]);

  const streamData = await streamRes.json();
  const transferData = await transferRes.json();

  const payments = new Map<string, IncomingPayment>();

  const streamLogs = Array.isArray(streamData.result) ? streamData.result : [];
  for (const log of streamLogs) {
    const topics = log.topics || [];
    if (topics.length < 4) continue;
    const sender = "0x" + (topics[2] || "").slice(26).toLowerCase();
    const amount = parseStreamCompletedData(log.data || "0x");
    if (amount <= 0n) continue;
    const txHash = (log.transactionHash || "").toLowerCase();
    const existing = payments.get(txHash);
    if (existing) {
      existing.amount += amount;
    } else {
      payments.set(txHash, { txHash, sender, amount, blockNumber: log.blockNumber || "" });
    }
  }

  const transferLogs = Array.isArray(transferData.result) ? transferData.result : [];
  for (const log of transferLogs) {
    const topics = log.topics || [];
    if (topics.length < 4) continue;
    const txHash = (log.transactionHash || "").toLowerCase();
    if (payments.has(txHash)) continue;
    const operator = "0x" + (topics[1] || "").slice(26).toLowerCase();
    const dataHex = log.data || "0x";
    const valueHex = dataHex.length >= 130 ? "0x" + dataHex.slice(66, 130) : "0x0";
    const amount = BigInt(valueHex);
    if (amount <= 0n) continue;
    payments.set(txHash, { txHash, sender: operator, amount, blockNumber: log.blockNumber || "" });
  }

  return Array.from(payments.values());
}

async function sendNfCrc(recipient: string, amountWei: bigint): Promise<string> {
  const botKey = process.env.BOT_PRIVATE_KEY;
  const rolesModAddress = process.env.ROLES_MODIFIER_ADDRESS;
  const roleKey = process.env.ROLE_KEY || "1";
  if (!botKey || !rolesModAddress) throw new Error("Payout not configured");

  const provider = new ethers.JsonRpcProvider("https://rpc.gnosischain.com");
  const wallet = new ethers.Wallet(botKey, provider);
  const rolesMod = new ethers.Contract(rolesModAddress, ROLES_MOD_ABI, wallet);

  const wrapperInterface = new ethers.Interface(ERC20_WRAPPER_ABI);
  const calldata = wrapperInterface.encodeFunctionData("transfer", [recipient, amountWei]);

  const roleId = parseInt(roleKey, 10);
  const tx = await rolesMod.execTransactionWithRole(NF_CRC_ERC20_WRAPPER, 0, calldata, 0, roleId, true);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`Transaction failed: ${tx.hash}`);
  return receipt.hash;
}

export async function POST() {
  try {
    const config = getPayoutConfig();
    if (!config.configured) {
      return NextResponse.json({ error: "Payout system not configured", missing: config.missingVars }, { status: 503 });
    }

    const allPayments = await scanIncomingPayments();
    if (allPayments.length === 0) {
      return NextResponse.json({ processed: 0, exchanges: [], message: "No incoming payments found" });
    }

    const existingExchanges = await db.select({ incomingTxHash: exchanges.incomingTxHash }).from(exchanges);
    const processedHashes = new Set(existingExchanges.map(e => e.incomingTxHash.toLowerCase()));

    const newPayments = allPayments.filter(p => !processedHashes.has(p.txHash));
    if (newPayments.length === 0) {
      return NextResponse.json({ processed: 0, exchanges: [], message: "All payments already processed" });
    }

    const balance = await getSafeCrcBalance();
    const results: any[] = [];

    for (const payment of newPayments) {
      const amountHuman = ethers.formatEther(payment.amount);
      const minAmount = ethers.parseEther("0.1");
      if (payment.amount < minAmount) continue;

      const [record] = await db.insert(exchanges).values({
        senderAddress: payment.sender,
        amountCrc: payment.amount.toString(),
        amountHuman,
        incomingTxHash: payment.txHash,
        status: "detected",
      }).returning();

      if (balance.erc20 < payment.amount) {
        await db.update(exchanges).set({
          status: "failed",
          errorMessage: `Insufficient NF CRC ERC-20 balance. Available: ${ethers.formatEther(balance.erc20)}, needed: ${amountHuman}`,
        }).where(eq(exchanges.id, record.id));

        results.push({ id: record.id, sender: payment.sender, amount: amountHuman, status: "failed", error: "Insufficient balance" });
        continue;
      }

      try {
        await db.update(exchanges).set({ status: "sending" }).where(eq(exchanges.id, record.id));
        const txHash = await sendNfCrc(payment.sender, payment.amount);

        await db.update(exchanges).set({
          status: "success",
          outgoingTxHash: txHash,
        }).where(eq(exchanges.id, record.id));

        balance.erc20 -= payment.amount;
        results.push({ id: record.id, sender: payment.sender, amount: amountHuman, status: "success", txHash });
      } catch (err: any) {
        await db.update(exchanges).set({
          status: "failed",
          errorMessage: err.message?.substring(0, 500),
        }).where(eq(exchanges.id, record.id));

        results.push({ id: record.id, sender: payment.sender, amount: amountHuman, status: "failed", error: err.message });
      }
    }

    return NextResponse.json({ processed: results.length, exchanges: results });
  } catch (error: any) {
    console.error("Exchange error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const recent = await db.select().from(exchanges).orderBy(desc(exchanges.createdAt)).limit(20);

    let safeErc20Balance = "0";
    try {
      const balance = await getSafeCrcBalance();
      safeErc20Balance = ethers.formatEther(balance.erc20);
    } catch {}

    return NextResponse.json({
      exchanges: recent,
      safeNfCrcBalance: safeErc20Balance,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
