const DEFAULT_CIRCLES_RPC_URL = "https://rpc.aboutcircles.com/";
const DEFAULT_RECIPIENT_ADDRESS = "0xbf57dc790ba892590c640dc27b26b2665d30104f";
const GNOSIS_RPC_URL = "https://rpc.gnosis.gateway.fm";
const CIRCLES_HUB_ADDRESS = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const TRANSFER_SINGLE_TOPIC = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";
const LOTTERY_START_BLOCK = "0x2AA0000";

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

type EventPayload = {
  event: string;
  values: Record<string, unknown>;
};

function normalizeAddress(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
}

function addressesMatch(a: string, b: string): boolean {
  const left = normalizeAddress(a);
  const right = normalizeAddress(b);
  return Boolean(left && right && left === right);
}

function padAddress(addr: string): string {
  const clean = addr.toLowerCase().replace("0x", "");
  return "0x" + clean.padStart(64, "0");
}

function mapStreamCompletedEvents(events: EventPayload[] = []): CirclesTransferEvent[] {
  return events
    .filter((item) => item.event === "CrcV2_StreamCompleted")
    .map((item) => {
      const v = item.values ?? {};
      const from = String(v.from ?? "");
      const to = String(v.to ?? "");
      const operator = String(v.operator ?? "");
      const amount = String(v.amount ?? "0");
      return {
        transactionHash: String(v.transactionHash ?? ""),
        from,
        to,
        operator,
        value: amount,
        blockNumber: String(v.blockNumber ?? ""),
        timestamp: String(v.timestamp ?? ""),
        transactionIndex: String(v.transactionIndex ?? ""),
        logIndex: String(v.logIndex ?? ""),
        sender: normalizeAddress(from) ?? from,
      };
    });
}

async function fetchStreamCompletedEvents(
  recipientAddress: string
): Promise<CirclesTransferEvent[]> {
  const normalized = normalizeAddress(recipientAddress);
  if (!normalized) return [];

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "circles_events",
    params: [normalized, null, null, ["CrcV2_StreamCompleted"]]
  };

  try {
    const response = await fetch(circlesConfig.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return [];

    const payload = await response.json();
    if (payload.error) return [];

    const result = Array.isArray(payload.result) ? payload.result : (payload.result?.events ?? []);
    return mapStreamCompletedEvents(Array.isArray(result) ? result : []);
  } catch {
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
      console.error("eth_getLogs error:", payload.error);
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
    fetchStreamCompletedEvents(normalized),
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
    fetchStreamCompletedEvents(normalized),
    fetchTransferSingleFromChain(normalized),
  ]);

  const exactWei = BigInt(exactAmountCRC) * WEI_PER_CRC;
  return deduplicateEvents(streamEvents, transferEvents, exactWei, normalized);
}

function aggregateTransfersByTx(
  events: CirclesTransferEvent[],
  recipientAddress: string,
): Map<string, CirclesTransferEvent> {
  const txMap = new Map<string, { total: bigint; event: CirclesTransferEvent }>();

  for (const event of events) {
    if (!addressesMatch(event.to, recipientAddress)) continue;
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
    if (!addressesMatch(event.to, recipientAddress)) continue;
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
