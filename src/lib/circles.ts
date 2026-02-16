const DEFAULT_CIRCLES_RPC_URL = "https://rpc.aboutcircles.com/";
const DEFAULT_RECIPIENT_ADDRESS = "0xbf57dc790ba892590c640dc27b26b2665d30104f";
const GNOSIS_RPC_URL = "https://rpc.gnosis.gateway.fm";
const CIRCLES_HUB_ADDRESS = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const STREAM_COMPLETED_TOPIC = "0xcfe53a731d24ac31b725405f3dca8a4d23512d3e1ade2359fbbe7982bec0fd42";
const TRANSFER_SINGLE_TOPIC = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const LOTTERY_START_BLOCK = "0x2A80000";

export type CirclesTransferEvent = {
  transactionHash: string;
  from: string;
  to: string;
  operator: string;
  value: string;
  blockNumber: string;
  timestamp: string;
  transactionIndex: string;
  logIndex: string;
  sender: string;
};

export const circlesConfig = {
  rpcUrl: process.env.NEXT_PUBLIC_CIRCLES_RPC_URL || DEFAULT_CIRCLES_RPC_URL,
  defaultRecipientAddress:
    process.env.NEXT_PUBLIC_DEFAULT_RECIPIENT_ADDRESS ||
    DEFAULT_RECIPIENT_ADDRESS
};

export function generatePaymentLink(
  recipientAddress: string,
  amountCRC: number,
  data: string
): string {
  const encodedData = encodeURIComponent(data);
  return `https://app.gnosis.io/transfer/${recipientAddress}/crc?data=${encodedData}&amount=${amountCRC}`;
}

function normalizeAddress(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function padAddress(addr: string): string {
  const clean = addr.toLowerCase().replace("0x", "");
  return "0x" + clean.padStart(64, "0");
}

async function fetchBlockTimestamps(blockNumbers: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(blockNumbers.filter(b => b && b !== ""))];
  if (unique.length === 0) return new Map();

  const results = new Map<string, number>();
  const batchSize = 20;

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const requests = batch.map((blockNum, idx) => ({
      jsonrpc: "2.0",
      id: idx + 1,
      method: "eth_getBlockByNumber",
      params: [blockNum, false],
    }));

    try {
      const response = await fetch(GNOSIS_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requests),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) continue;

      const payload = await response.json();
      const responses = Array.isArray(payload) ? payload : [payload];

      for (let j = 0; j < responses.length; j++) {
        const res = responses[j];
        if (res?.result?.timestamp) {
          const ts = parseInt(res.result.timestamp, 16);
          if (ts > 0) results.set(batch[j], ts);
        }
      }
    } catch {
      continue;
    }
  }

  return results;
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

async function fetchStreamCompletedFromChain(
  recipientAddress: string
): Promise<CirclesTransferEvent[]> {
  const normalized = normalizeAddress(recipientAddress);
  if (!normalized) return [];

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getLogs",
    params: [{
      fromBlock: LOTTERY_START_BLOCK,
      toBlock: "latest",
      address: CIRCLES_HUB_ADDRESS,
      topics: [
        STREAM_COMPLETED_TOPIC,
        null,
        null,
        padAddress(normalized),
      ],
    }],
  };

  try {
    const response = await fetch(GNOSIS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const payload = await response.json();
    if (payload.error) {
      console.error("StreamCompleted eth_getLogs error:", payload.error);
      return [];
    }

    const logs = Array.isArray(payload.result) ? payload.result : [];
    const results: CirclesTransferEvent[] = [];

    for (const log of logs) {
      const topics = log.topics || [];
      if (topics.length < 4) continue;

      const operator = "0x" + (topics[1] || "").slice(26);
      const sender = "0x" + (topics[2] || "").slice(26);
      const receiver = "0x" + (topics[3] || "").slice(26);
      const totalAmount = parseStreamCompletedData(log.data || "0x");

      results.push({
        transactionHash: log.transactionHash || "",
        from: sender.toLowerCase(),
        to: receiver.toLowerCase(),
        operator: operator.toLowerCase(),
        value: totalAmount.toString(),
        blockNumber: log.blockNumber || "",
        timestamp: "",
        transactionIndex: log.transactionIndex || "",
        logIndex: log.logIndex || "",
        sender: sender.toLowerCase(),
      });
    }

    return results;
  } catch (err) {
    console.error("fetchStreamCompletedFromChain error:", err);
    return [];
  }
}

async function fetchTransferSingleFromChain(
  recipientAddress: string
): Promise<CirclesTransferEvent[]> {
  const normalized = normalizeAddress(recipientAddress);
  if (!normalized) return [];

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getLogs",
    params: [{
      fromBlock: LOTTERY_START_BLOCK,
      toBlock: "latest",
      address: CIRCLES_HUB_ADDRESS,
      topics: [
        TRANSFER_SINGLE_TOPIC,
        null,
        null,
        padAddress(normalized),
      ],
    }],
  };

  try {
    const response = await fetch(GNOSIS_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const payload = await response.json();
    if (payload.error) {
      console.error("TransferSingle eth_getLogs error:", payload.error);
      return [];
    }

    const logs = Array.isArray(payload.result) ? payload.result : [];
    const results: CirclesTransferEvent[] = [];

    for (const log of logs) {
      const topics = log.topics || [];
      if (topics.length < 4) continue;

      const operator = "0x" + (topics[1] || "").slice(26);
      const from = "0x" + (topics[2] || "").slice(26);
      const to = "0x" + (topics[3] || "").slice(26);
      const dataHex = log.data || "0x";
      const valueHex = dataHex.length >= 130 ? "0x" + dataHex.slice(66, 130) : "0x0";
      const value = BigInt(valueHex).toString();

      results.push({
        transactionHash: log.transactionHash || "",
        from: from.toLowerCase(),
        to: to.toLowerCase(),
        operator: operator.toLowerCase(),
        value,
        blockNumber: log.blockNumber || "",
        timestamp: "",
        transactionIndex: log.transactionIndex || "",
        logIndex: log.logIndex || "",
        sender: operator.toLowerCase(),
      });
    }

    return results;
  } catch (err) {
    console.error("fetchTransferSingleFromChain error:", err);
    return [];
  }
}

const WEI_PER_CRC = BigInt("1000000000000000000");

export async function checkPaymentReceived(
  _dataValue: string,
  exactAmountCRC: number,
  recipientAddress?: string | null,
  excludeTxHashes?: Set<string>
): Promise<CirclesTransferEvent | null> {
  if (exactAmountCRC <= 0) return null;

  const normalized = normalizeAddress(recipientAddress ?? "");
  if (!normalized) return null;

  const [streamEvents, transferEvents] = await Promise.all([
    fetchStreamCompletedFromChain(normalized),
    fetchTransferSingleFromChain(normalized),
  ]);

  const exactWei = BigInt(exactAmountCRC) * WEI_PER_CRC;

  const allEvents = deduplicateEvents(streamEvents, transferEvents, exactWei, normalized);

  for (const event of allEvents) {
    if (excludeTxHashes && excludeTxHashes.has(event.transactionHash.toLowerCase())) continue;
    return event;
  }

  return null;
}

export async function checkAllNewPayments(
  exactAmountCRC: number,
  recipientAddress: string
): Promise<CirclesTransferEvent[]> {
  const normalized = normalizeAddress(recipientAddress);
  if (!normalized || exactAmountCRC <= 0) return [];

  const [streamEvents, transferEvents] = await Promise.all([
    fetchStreamCompletedFromChain(normalized),
    fetchTransferSingleFromChain(normalized),
  ]);

  const exactWei = BigInt(exactAmountCRC) * WEI_PER_CRC;
  const events = deduplicateEvents(streamEvents, transferEvents, exactWei, normalized);

  const blockNumbers = events
    .map(e => e.blockNumber)
    .filter(b => b && b !== "");

  if (blockNumbers.length > 0) {
    const timestamps = await fetchBlockTimestamps(blockNumbers);
    for (const event of events) {
      if (event.blockNumber && timestamps.has(event.blockNumber)) {
        event.timestamp = timestamps.get(event.blockNumber)!.toString();
      }
    }
  }

  return events;
}

function aggregateTransfersByTx(
  events: CirclesTransferEvent[],
  recipientAddress: string,
): Map<string, CirclesTransferEvent> {
  const txMap = new Map<string, { total: bigint; event: CirclesTransferEvent }>();

  for (const event of events) {
    const toNorm = normalizeAddress(event.to);
    const recipNorm = normalizeAddress(recipientAddress);
    if (!toNorm || !recipNorm || toNorm !== recipNorm) continue;
    const txKey = event.transactionHash.toLowerCase();
    let val: bigint;
    try { val = BigInt(event.value); } catch { continue; }

    const existing = txMap.get(txKey);
    if (existing) {
      existing.total += val;
    } else {
      txMap.set(txKey, { total: val, event: { ...event } });
    }
  }

  const result = new Map<string, CirclesTransferEvent>();
  for (const [txKey, { total, event }] of txMap) {
    event.value = total.toString();
    result.set(txKey, event);
  }
  return result;
}

function deduplicateEvents(
  streamEvents: CirclesTransferEvent[],
  transferEvents: CirclesTransferEvent[],
  exactWei: bigint,
  recipientAddress: string,
): CirclesTransferEvent[] {
  const seenTxHashes = new Set<string>();
  const results: CirclesTransferEvent[] = [];

  for (const event of streamEvents) {
    try {
      if (BigInt(event.value) !== exactWei) continue;
    } catch { continue; }
    const txKey = event.transactionHash.toLowerCase();
    if (seenTxHashes.has(txKey)) continue;
    seenTxHashes.add(txKey);
    results.push(event);
  }

  const aggregated = aggregateTransfersByTx(transferEvents, recipientAddress);
  for (const [txKey, event] of aggregated) {
    if (seenTxHashes.has(txKey)) continue;
    try {
      if (BigInt(event.value) !== exactWei) continue;
    } catch { continue; }
    seenTxHashes.add(txKey);
    results.push(event);
  }

  return results;
}
