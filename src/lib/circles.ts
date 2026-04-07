import { encodeGameData } from "@/lib/game-data";

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
  gameData?: { game: string; id: string; v: number; t?: string } | null;
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

export function generateGamePaymentLink(
  recipientAddress: string,
  amountCRC: number,
  gameType: string,
  gameSlug: string,
  playerToken?: string,
): string {
  // Format: "game:slug:token" as plain text (Gnosis App requires plain text, not hex)
  const parts = [gameType, gameSlug];
  if (playerToken) parts.push(playerToken);
  const data = parts.join(":");
  return `https://app.gnosis.io/transfer/${recipientAddress}/crc?data=${encodeURIComponent(data)}&amount=${amountCRC}`;
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
  dataValue: string,
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

  const candidates = allEvents.filter(
    e => !excludeTxHashes || !excludeTxHashes.has(e.transactionHash.toLowerCase())
  );

  if (candidates.length === 0) return null;

  // Decode expected game data — if empty/invalid, no game filter (backward compat)
  const { decodeGameData } = await import("@/lib/game-data");
  const expectedGame = decodeGameData(dataValue);

  if (!expectedGame) {
    // No game filter: return first candidate
    return candidates[0];
  }

  // Fetch tx input data for all candidates to verify game ownership
  const txHashes = candidates.map(e => e.transactionHash);
  const gameDataMap = await fetchTxInputGameData(txHashes);

  for (const event of candidates) {
    const txGameData = gameDataMap.get(event.transactionHash.toLowerCase());

    // Watcher is strict: require explicit game data to avoid false positives from old/manual txs
    if (!txGameData) continue;

    if (txGameData.game === expectedGame.game && txGameData.id === expectedGame.id) {
      return event;
    }
    // Game data for a different game → skip
  }

  return null;
}

/**
 * Fetch CrcV2_TransferData events from Circles RPC to get the `data` field.
 * This is how Gnosis App stores the payment data (plain text format).
 */
async function fetchTransferDataGameData(
  recipientAddress: string,
  txHashes: Set<string>
): Promise<Map<string, { game: string; id: string; v: number; t?: string }>> {
  const { decodeGameData } = await import("@/lib/game-data");
  const results = new Map<string, { game: string; id: string; v: number; t?: string }>();

  try {
    const response = await fetch(circlesConfig.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "circles_events",
        params: [recipientAddress, null, null, ["CrcV2_TransferData"]],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return results;

    const payload = await response.json();
    if (payload.error) return results;

    const events = payload.result?.events || [];
    for (const item of events) {
      const values = item.values ?? {};
      const txHash = String(values.transactionHash ?? "").toLowerCase();
      const dataField = String(values.data ?? "");

      if (!txHash || !txHashes.has(txHash) || !dataField) continue;

      // Try to decode the data field — could be plain text "game:id:token" or hex-encoded
      let decoded = decodeGameData(dataField);

      // Also try hex-to-utf8 decoding
      if (!decoded) {
        const hexStr = dataField.startsWith("0x") ? dataField.slice(2) : dataField;
        if (/^[0-9a-fA-F]+$/.test(hexStr) && hexStr.length > 0 && hexStr.length % 2 === 0) {
          try {
            const bytes = new Uint8Array(hexStr.length / 2);
            for (let k = 0; k < hexStr.length; k += 2) {
              bytes[k / 2] = parseInt(hexStr.slice(k, k + 2), 16);
            }
            const text = new TextDecoder().decode(bytes).replace(/\0/g, "").trim();
            decoded = decodeGameData(text);
          } catch {}
        }
      }

      if (decoded) {
        results.set(txHash, decoded);
      }
    }
  } catch {}

  return results;
}

async function fetchTxInputGameData(txHashes: string[]): Promise<Map<string, { game: string; id: string; v: number }>> {
  const { decodeGameData } = await import("@/lib/game-data");
  const results = new Map<string, { game: string; id: string; v: number }>();
  if (txHashes.length === 0) return results;

  const batchSize = 20;
  for (let i = 0; i < txHashes.length; i += batchSize) {
    const batch = txHashes.slice(i, i + batchSize);
    const requests = batch.map((hash, idx) => ({
      jsonrpc: "2.0",
      id: idx + 1,
      method: "eth_getTransactionByHash",
      params: [hash],
    }));

    try {
      const response = await fetch(GNOSIS_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requests),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) continue;

      const payload = await response.json();
      const responses = Array.isArray(payload) ? payload : [payload];

      for (let j = 0; j < responses.length; j++) {
        const res = responses[j];
        const input = res?.result?.input;
        if (!input || input.length < 10) continue;

        const inputData = input.slice(10);
        const hexStr = inputData.replace(/^0+/, "");
        if (hexStr.length < 2) continue;

        // Try to decode the entire input as UTF-8 text first (new format: "game:id:token")
        try {
          const cleanHex = inputData.replace(/0+$/, ""); // trim trailing zeros
          if (cleanHex.length >= 2) {
            const fullBytes = new Uint8Array(cleanHex.length / 2);
            for (let k = 0; k < cleanHex.length; k += 2) {
              fullBytes[k / 2] = parseInt(cleanHex.slice(k, k + 2), 16);
            }
            const fullText = new TextDecoder().decode(fullBytes).replace(/\0/g, "").trim();
            const decoded = decodeGameData(fullText);
            if (decoded) {
              results.set(batch[j].toLowerCase(), decoded);
              continue;
            }
          }
        } catch {}

        // Fallback: scan for JSON object (legacy format: {"game":"morpion",...})
        for (let offset = 0; offset < inputData.length - 4; offset += 2) {
          const byte = parseInt(inputData.slice(offset, offset + 2), 16);
          if (byte === 0x7b) {
            const remaining = inputData.slice(offset);
            try {
              const bytes = new Uint8Array(remaining.length / 2);
              for (let k = 0; k < remaining.length; k += 2) {
                bytes[k / 2] = parseInt(remaining.slice(k, k + 2), 16);
              }
              const text = new TextDecoder().decode(bytes);
              const jsonEnd = text.indexOf("}");
              if (jsonEnd === -1) continue;
              const jsonStr = text.slice(0, jsonEnd + 1);
              const decoded = decodeGameData(jsonStr);
              if (decoded) {
                results.set(batch[j].toLowerCase(), decoded);
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }
    } catch {
      continue;
    }
  }

  return results;
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

  const txHashes = [...new Set(events.map(e => e.transactionHash).filter(h => h))];
  if (txHashes.length > 0) {
    const txHashSet = new Set(txHashes.map(h => h.toLowerCase()));

    // Try CrcV2_TransferData events first (new plain text format)
    const transferDataMap = await fetchTransferDataGameData(normalized, txHashSet);

    // Fallback to tx input parsing (legacy hex/JSON format)
    const txInputMap = await fetchTxInputGameData(txHashes);

    for (const event of events) {
      const txKey = event.transactionHash.toLowerCase();
      // Prefer TransferData events, fallback to tx input
      event.gameData = transferDataMap.get(txKey) || txInputMap.get(txKey) || null;
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
