import { ethers } from "ethers";
import { db } from "./db";
import { payouts, botState } from "./db/schema";
import { eq, sql } from "drizzle-orm";

const GNOSIS_RPC = "https://rpc.gnosischain.com";
const CIRCLES_HUB_V2 = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const NF_GROUP_ADDRESS = "0x7dd9f44c7f1a6788221a92305f9e7ea790675e9b";
const NF_TOKEN_ID = BigInt(NF_GROUP_ADDRESS);
const MAX_RETRY_ATTEMPTS = 3;
const SENDING_TIMEOUT_MS = 30 * 60 * 1000; // 30 min before a "sending" tx is considered stuck

const ROLES_MOD_ABI = [
  "function execTransactionWithRole(address to, uint256 value, bytes data, uint8 operation, bytes32 roleKey, bool shouldRevert) external returns (bool success)",
];

const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
];

export type PayoutConfig = {
  configured: boolean;
  missingVars: string[];
  botAddress?: string;
  safeAddress?: string;
  rolesModAddress?: string;
};

export function getPayoutConfig(): PayoutConfig {
  const required = ["BOT_PRIVATE_KEY", "SAFE_ADDRESS", "ROLES_MODIFIER_ADDRESS", "ROLE_KEY"];
  const missing = required.filter((k) => !process.env[k]);

  if (missing.length > 0) {
    return { configured: false, missingVars: missing };
  }

  const wallet = new ethers.Wallet(process.env.BOT_PRIVATE_KEY!);
  return {
    configured: true,
    missingVars: [],
    botAddress: wallet.address,
    safeAddress: process.env.SAFE_ADDRESS,
    rolesModAddress: process.env.ROLES_MODIFIER_ADDRESS,
  };
}

function getProvider() {
  return new ethers.JsonRpcProvider(GNOSIS_RPC);
}

function getBotWallet() {
  const provider = getProvider();
  return new ethers.Wallet(process.env.BOT_PRIVATE_KEY!, provider);
}

function getRoleKey(): string {
  const key = process.env.ROLE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
  if (key.startsWith("0x")) {
    return key.padEnd(66, "0").slice(0, 66);
  }
  return "0x" + BigInt(key).toString(16).padStart(64, "0");
}

export async function getSafeCrcBalance(): Promise<{ erc1155: bigint; erc20: bigint }> {
  const provider = getProvider();
  const safeAddress = process.env.SAFE_ADDRESS;
  if (!safeAddress) throw new Error("SAFE_ADDRESS not configured");

  const hub = new ethers.Contract(CIRCLES_HUB_V2, ERC1155_ABI, provider);
  const erc1155Balance = await hub.balanceOf(safeAddress, NF_TOKEN_ID);

  return { erc1155: erc1155Balance, erc20: 0n };
}

export async function getBotXdaiBalance(): Promise<string> {
  const wallet = getBotWallet();
  const balance = await wallet.provider!.getBalance(wallet.address);
  return ethers.formatEther(balance);
}

/**
 * Atomically reserve the next nonce for the bot wallet using a Postgres
 * UPDATE ... RETURNING. Two concurrent calls cannot receive the same value,
 * which eliminates the "replacement fee too low" race across Vercel lambdas.
 */
async function reserveNonce(): Promise<number> {
  const result = await db.execute<{ last_nonce: number }>(
    sql`UPDATE bot_state SET last_nonce = last_nonce + 1, updated_at = NOW() WHERE id = 1 RETURNING last_nonce`,
  );
  const row = (result as any).rows?.[0] ?? (result as any)[0];
  if (!row || typeof row.last_nonce !== "number") {
    throw new Error("bot_state row missing — run scripts/init-bot-nonce.mjs first");
  }
  return row.last_nonce;
}

/**
 * Pulls the current on-chain pending nonce and bumps bot_state.last_nonce
 * forward if it's behind. Used as a recovery step when a broadcast fails
 * with NONCE_EXPIRED (e.g. when another environment sharing the same
 * BOT_PRIVATE_KEY advanced the chain nonce between our reserves).
 *
 * `GREATEST(last_nonce, onchain - 1)` guarantees we never walk backwards,
 * which preserves the serial invariant for in-flight pending reservations.
 */
async function resyncNonceFromChain(wallet: ethers.Wallet): Promise<number> {
  const onchainPending = await wallet.provider!.getTransactionCount(wallet.address, "pending");
  const target = onchainPending - 1;
  await db.execute(
    sql`UPDATE bot_state SET last_nonce = GREATEST(last_nonce, ${target}), updated_at = NOW() WHERE id = 1`,
  );
  return onchainPending;
}

function isNonceTooLowError(err: any): boolean {
  const code = err?.code;
  if (code === "NONCE_EXPIRED") return true;
  const msg = String(err?.message || err?.info?.error?.message || "").toLowerCase();
  return /nonce too low|nonce has already been used|already known/.test(msg);
}

async function execViaRolesMod(
  targetAddress: string,
  calldata: string,
  value: bigint = 0n,
  { resyncAttempted = false }: { resyncAttempted?: boolean } = {},
): Promise<{ hash: string }> {
  const wallet = getBotWallet();
  const rolesModAddress = process.env.ROLES_MODIFIER_ADDRESS;
  if (!rolesModAddress) throw new Error("ROLES_MODIFIER_ADDRESS not configured");

  const rolesMod = new ethers.Contract(rolesModAddress, ROLES_MOD_ABI, wallet);
  const roleKey = getRoleKey();

  const nonce = await reserveNonce();

  // Fire-and-forget: broadcast the TX with an explicit nonce, return the hash
  // immediately. We do NOT call tx.wait() — the cron job verifies confirmation
  // later, which avoids Vercel lambda timeouts and keeps the bot serial.
  try {
    const tx = await rolesMod.execTransactionWithRole(
      targetAddress,
      value,
      calldata,
      0,
      roleKey,
      true,
      { nonce },
    );
    return { hash: tx.hash };
  } catch (err: any) {
    // Auto-heal when bot_state has drifted behind on-chain (typically because
    // another env — e.g. Vercel prod vs local dev — sharing the same
    // BOT_PRIVATE_KEY broadcast tx'ing in between). Resync once and retry.
    if (isNonceTooLowError(err) && !resyncAttempted) {
      const newPending = await resyncNonceFromChain(wallet);
      console.warn(
        `[Payout] Nonce collision (reserved=${nonce}, on-chain pending=${newPending}). Resynced and retrying once.`,
      );
      return execViaRolesMod(targetAddress, calldata, value, { resyncAttempted: true });
    }
    throw err;
  }
}

async function transferErc1155(recipient: string, amountWei: bigint): Promise<string> {
  const safeAddress = process.env.SAFE_ADDRESS!;
  const hubInterface = new ethers.Interface(ERC1155_ABI);
  const calldata = hubInterface.encodeFunctionData("safeTransferFrom", [
    safeAddress,
    recipient,
    NF_TOKEN_ID,
    amountWei,
    "0x",
  ]);

  const { hash } = await execViaRolesMod(CIRCLES_HUB_V2, calldata);
  return hash;
}

export type PayoutRequest = {
  gameType: string;
  gameId: string;
  recipientAddress: string;
  amountCrc: number;
  reason?: string;
};

export type PayoutResult = {
  success: boolean;
  payoutId?: number;
  status: string;
  wrapTxHash?: string;
  transferTxHash?: string;
  error?: string;
};

export async function executePayout(request: PayoutRequest): Promise<PayoutResult> {
  const config = getPayoutConfig();
  if (!config.configured) {
    return { success: false, status: "failed", error: `Payout not configured. Missing: ${config.missingVars.join(", ")}` };
  }

  const maxPayoutCrc = parseInt(process.env.MAX_PAYOUT_CRC || "1000", 10);
  if (request.amountCrc > maxPayoutCrc) {
    return { success: false, status: "failed", error: `Amount ${request.amountCrc} CRC exceeds maximum ${maxPayoutCrc} CRC` };
  }
  if (request.amountCrc <= 0) {
    return { success: false, status: "failed", error: "Amount must be greater than 0" };
  }

  const existing = await db.select().from(payouts).where(eq(payouts.gameId, request.gameId)).limit(1);
  if (existing.length > 0) {
    const ex = existing[0];
    if (ex.status === "success") {
      return { success: false, status: "already_paid", error: `Payout already executed for gameId ${request.gameId}`, payoutId: ex.id };
    }
    if (ex.status === "sending") {
      return { success: false, status: "already_sending", error: `Payout already broadcast for gameId ${request.gameId}, awaiting confirmation`, payoutId: ex.id, transferTxHash: ex.transferTxHash || undefined };
    }
    if (ex.status === "failed" && ex.attempts >= MAX_RETRY_ATTEMPTS) {
      return { success: false, status: "max_retries", error: `Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached for gameId ${request.gameId}`, payoutId: ex.id };
    }
  }

  let payoutRecord: any;
  if (existing.length > 0 && existing[0].status === "failed") {
    payoutRecord = existing[0];
    await db.update(payouts).set({
      status: "pending",
      errorMessage: null,
      updatedAt: new Date(),
    }).where(eq(payouts.id, payoutRecord.id));
  } else if (existing.length === 0) {
    const [inserted] = await db.insert(payouts).values({
      gameType: request.gameType,
      gameId: request.gameId,
      recipientAddress: request.recipientAddress,
      amountCrc: request.amountCrc,
      reason: request.reason || null,
      status: "pending",
    }).returning();
    payoutRecord = inserted;
  } else {
    payoutRecord = existing[0];
  }

  const amountWei = ethers.parseEther(String(request.amountCrc));
  const currentAttempt = payoutRecord.attempts + 1;

  await db.update(payouts).set({
    attempts: currentAttempt,
    updatedAt: new Date(),
  }).where(eq(payouts.id, payoutRecord.id));

  try {
    const balance = await getSafeCrcBalance();
    if (balance.erc1155 < amountWei) {
      throw new Error(`Insufficient Safe balance. ERC-1155: ${ethers.formatEther(balance.erc1155)} CRC, needed: ${request.amountCrc}`);
    }

    await db.update(payouts).set({
      status: "sending",
      updatedAt: new Date(),
    }).where(eq(payouts.id, payoutRecord.id));

    console.log(`[Payout] Broadcasting ${request.amountCrc} CRC ERC-1155 to ${request.recipientAddress}...`);
    const transferTxHash = await transferErc1155(request.recipientAddress, amountWei);
    console.log(`[Payout] Broadcast tx: ${transferTxHash} (awaiting confirmation by cron)`);

    await db.update(payouts).set({
      transferTxHash,
      status: "sending",
      updatedAt: new Date(),
    }).where(eq(payouts.id, payoutRecord.id));

    return {
      success: true,
      payoutId: payoutRecord.id,
      status: "sending",
      transferTxHash,
    };
  } catch (error: any) {
    console.error(`[Payout] Error (attempt ${currentAttempt}/${MAX_RETRY_ATTEMPTS}):`, error.message);
    await db.update(payouts).set({
      status: "failed",
      errorMessage: error.message?.substring(0, 500),
      updatedAt: new Date(),
    }).where(eq(payouts.id, payoutRecord.id));

    return {
      success: false,
      payoutId: payoutRecord.id,
      status: "failed",
      error: error.message,
    };
  }
}

export async function retryPayout(payoutId: number): Promise<PayoutResult> {
  const [record] = await db.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1);
  if (!record) {
    return { success: false, status: "not_found", error: "Payout not found" };
  }
  if (record.status === "success") {
    return { success: false, status: "already_paid", error: "Payout already succeeded" };
  }
  if (record.attempts >= MAX_RETRY_ATTEMPTS) {
    return { success: false, status: "max_retries", error: `Max retry attempts (${MAX_RETRY_ATTEMPTS}) reached` };
  }

  return executePayout({
    gameType: record.gameType,
    gameId: record.gameId,
    recipientAddress: record.recipientAddress,
    amountCrc: record.amountCrc,
    reason: record.reason || undefined,
  });
}

/**
 * Verify a payout that was broadcast but not yet confirmed. Called by the cron
 * monitor every 5 min to reconcile fire-and-forget transactions.
 *
 * - Receipt confirmed (status=1) → marks payout as 'success'
 * - Receipt reverted (status=0) → marks 'failed', retryable
 * - No receipt yet, < SENDING_TIMEOUT_MS → leaves as 'sending' (not yet mined)
 * - No receipt and > SENDING_TIMEOUT_MS → marks 'failed' (likely lost), retryable
 */
export async function verifyPendingPayout(payoutId: number): Promise<{
  status: "success" | "still_pending" | "failed";
  txHash?: string;
}> {
  const [record] = await db.select().from(payouts).where(eq(payouts.id, payoutId)).limit(1);
  if (!record) return { status: "failed" };
  if (record.status !== "sending") return { status: "still_pending" };
  if (!record.transferTxHash) {
    // Edge case: row marked sending but no tx hash recorded — treat as failed
    await db.update(payouts).set({
      status: "failed",
      errorMessage: "Marked sending but no transferTxHash recorded",
      updatedAt: new Date(),
    }).where(eq(payouts.id, payoutId));
    return { status: "failed" };
  }

  const provider = getProvider();
  let receipt: ethers.TransactionReceipt | null = null;
  try {
    receipt = await provider.getTransactionReceipt(record.transferTxHash);
  } catch (err: any) {
    console.error(`[Payout] verify ${payoutId} RPC error:`, err.message);
    return { status: "still_pending" };
  }

  if (receipt) {
    if (receipt.status === 1) {
      await db.update(payouts).set({
        status: "success",
        updatedAt: new Date(),
      }).where(eq(payouts.id, payoutId));
      return { status: "success", txHash: record.transferTxHash };
    } else {
      await db.update(payouts).set({
        status: "failed",
        errorMessage: `Transaction reverted on-chain (tx: ${record.transferTxHash})`,
        updatedAt: new Date(),
      }).where(eq(payouts.id, payoutId));
      return { status: "failed", txHash: record.transferTxHash };
    }
  }

  // No receipt yet — check timeout
  const ageMs = Date.now() - new Date(record.updatedAt).getTime();
  if (ageMs > SENDING_TIMEOUT_MS) {
    await db.update(payouts).set({
      status: "failed",
      errorMessage: `No receipt after ${Math.round(ageMs / 60000)} min — tx likely dropped from mempool`,
      updatedAt: new Date(),
    }).where(eq(payouts.id, payoutId));
    return { status: "failed", txHash: record.transferTxHash };
  }

  return { status: "still_pending", txHash: record.transferTxHash };
}
