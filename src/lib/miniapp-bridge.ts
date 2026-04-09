/**
 * Circles Mini App Bridge
 *
 * Handles postMessage communication between NF Society (running in iframe)
 * and the Circles Mini App host.
 *
 * Protocol:
 *   Mini App → Host: request_address, send_transactions, sign_message
 *   Host → Mini App: wallet_connected, wallet_disconnected, tx_success, tx_rejected, app_data
 */

// ── Types ──────────────────────────────────────────────────────────

export type MiniAppMessage =
  | { type: "wallet_connected"; address: string }
  | { type: "wallet_disconnected" }
  | { type: "tx_success"; hashes: string[]; requestId: string }
  | { type: "tx_rejected"; reason?: string; requestId: string }
  | { type: "app_data"; data: unknown };

type PendingTx = {
  resolve: (hashes: string[]) => void;
  reject: (reason: string) => void;
};

// ── State ──────────────────────────────────────────────────────────

let walletAddress: string | null = null;
let walletListeners: Array<(address: string | null) => void> = [];
let pendingTxs = new Map<string, PendingTx>();
let messageListenerAttached = false;

// ── Detection ──────────────────────────────────────────────────────

/** Returns true if running inside an iframe (Circles Mini App host) */
export function isMiniApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window !== window.parent;
  } catch {
    // Cross-origin iframe — we are indeed in an iframe
    return true;
  }
}

// ── Message handling ───────────────────────────────────────────────

function handleMessage(event: MessageEvent) {
  const data = event.data;
  if (!data || typeof data.type !== "string") return;

  switch (data.type) {
    case "wallet_connected": {
      walletAddress = data.address?.toLowerCase() ?? null;
      walletListeners.forEach((cb) => cb(walletAddress));
      break;
    }
    case "wallet_disconnected": {
      walletAddress = null;
      walletListeners.forEach((cb) => cb(null));
      break;
    }
    case "tx_success": {
      const pending = pendingTxs.get(data.requestId);
      if (pending) {
        pending.resolve(data.hashes ?? []);
        pendingTxs.delete(data.requestId);
      }
      break;
    }
    case "tx_rejected": {
      const pending = pendingTxs.get(data.requestId);
      if (pending) {
        pending.reject(data.reason ?? "Transaction rejected");
        pendingTxs.delete(data.requestId);
      }
      break;
    }
  }
}

function ensureListener() {
  if (messageListenerAttached || typeof window === "undefined") return;
  window.addEventListener("message", handleMessage);
  messageListenerAttached = true;
}

// ── Public API ─────────────────────────────────────────────────────

/** Request the wallet address from the Circles host */
export function requestAddress(): void {
  if (typeof window === "undefined") return;
  ensureListener();
  window.parent.postMessage({ type: "request_address" }, "*");
}

/** Subscribe to wallet address changes. Returns unsubscribe function. */
export function onWalletChange(callback: (address: string | null) => void): () => void {
  ensureListener();
  walletListeners.push(callback);
  // Immediately call with current value if available
  if (walletAddress) callback(walletAddress);
  return () => {
    walletListeners = walletListeners.filter((cb) => cb !== callback);
  };
}

/** Get the current wallet address (may be null if not yet connected) */
export function getWalletAddress(): string | null {
  return walletAddress;
}

/**
 * Send a CRC transfer via the Circles host wallet.
 * Returns the transaction hashes on success, throws on rejection.
 */
export function sendCrcTransfer(
  to: string,
  amountWei: string,
  data?: string
): Promise<string[]> {
  ensureListener();

  const requestId = crypto.randomUUID();

  return new Promise((resolve, reject) => {
    pendingTxs.set(requestId, { resolve, reject });

    const tx: Record<string, string> = {
      to,
      value: amountWei,
    };
    if (data) tx.data = data;

    window.parent.postMessage(
      {
        type: "send_transactions",
        transactions: [tx],
        requestId,
      },
      "*"
    );

    // Timeout after 2 minutes
    setTimeout(() => {
      if (pendingTxs.has(requestId)) {
        pendingTxs.delete(requestId);
        reject("Transaction timed out");
      }
    }, 120_000);
  });
}

/** Clean up all listeners (call on unmount) */
export function cleanup() {
  if (typeof window === "undefined") return;
  window.removeEventListener("message", handleMessage);
  messageListenerAttached = false;
  walletListeners = [];
  pendingTxs.clear();
  walletAddress = null;
}
