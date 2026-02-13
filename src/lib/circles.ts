const DEFAULT_CIRCLES_RPC_URL = "https://rpc.aboutcircles.com/";
const DEFAULT_RECIPIENT_ADDRESS = "0xbf57dc790ba892590c640dc27b26b2665d30104f";

export type CirclesTransferEvent = {
  transactionHash: string;
  from: string;
  to: string;
  value: string;
  blockNumber: string;
  timestamp: string;
  transactionIndex: string;
  logIndex: string;
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

function mapTransferSingleEvents(events: EventPayload[] = []): CirclesTransferEvent[] {
  return events
    .filter((item) => item.event === "CrcV2_TransferSingle")
    .map((item) => {
      const v = item.values ?? {};
      return {
        transactionHash: String(v.transactionHash ?? ""),
        from: String(v.from ?? ""),
        to: String(v.to ?? ""),
        value: String(v.value ?? "0"),
        blockNumber: String(v.blockNumber ?? ""),
        timestamp: String(v.timestamp ?? ""),
        transactionIndex: String(v.transactionIndex ?? ""),
        logIndex: String(v.logIndex ?? ""),
      };
    });
}

async function fetchTransferEvents(
  recipientAddress: string
): Promise<CirclesTransferEvent[]> {
  const normalized = normalizeAddress(recipientAddress);
  if (!normalized) return [];

  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "circles_events",
    params: [normalized, null, null, ["CrcV2_TransferSingle"]]
  };

  const response = await fetch(circlesConfig.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`circles_events failed: ${response.status} ${text}`);
  }

  const payload = await response.json();

  if (payload.error) {
    throw new Error(payload.error.message || "circles_events returned an error");
  }

  const result = Array.isArray(payload.result) ? payload.result : (payload.result?.events ?? []);
  return mapTransferSingleEvents(Array.isArray(result) ? result : []);
}

const WEI_PER_CRC = BigInt("1000000000000000000");

export async function checkPaymentReceived(
  _dataValue: string,
  minAmountCRC: number,
  recipientAddress?: string | null,
  excludeTxHashes?: Set<string>
): Promise<CirclesTransferEvent | null> {
  if (minAmountCRC <= 0) return null;

  const normalized = normalizeAddress(recipientAddress ?? "");
  if (!normalized) return null;

  const events = await fetchTransferEvents(normalized);
  const minWei = BigInt(minAmountCRC) * WEI_PER_CRC;

  for (const event of events) {
    if (!addressesMatch(event.to, normalized)) continue;
    if (addressesMatch(event.from, "0x0000000000000000000000000000000000000000")) continue;
    if (excludeTxHashes && excludeTxHashes.has(event.transactionHash.toLowerCase())) continue;

    try {
      const val = BigInt(event.value);
      if (val >= minWei) {
        return event;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export async function checkAllNewPayments(
  minAmountCRC: number,
  recipientAddress: string
): Promise<CirclesTransferEvent[]> {
  const normalized = normalizeAddress(recipientAddress);
  if (!normalized || minAmountCRC <= 0) return [];

  const events = await fetchTransferEvents(normalized);
  const minWei = BigInt(minAmountCRC) * WEI_PER_CRC;
  const results: CirclesTransferEvent[] = [];

  for (const event of events) {
    if (!addressesMatch(event.to, normalized)) continue;
    if (addressesMatch(event.from, "0x0000000000000000000000000000000000000000")) continue;

    try {
      const val = BigInt(event.value);
      if (val >= minWei) {
        results.push(event);
      }
    } catch {
      continue;
    }
  }

  return results;
}
