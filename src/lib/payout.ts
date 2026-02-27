import { ethers } from "ethers";
import { db } from "./db";
import { payouts } from "./db/schema";
import { eq } from "drizzle-orm";

const GNOSIS_RPC = "https://rpc.gnosischain.com";
const CIRCLES_HUB_V2 = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const NF_GROUP_ADDRESS = "0x7dd9f44c7f1a6788221a92305f9e7ea790675e9b";
const NF_CRC_ERC20_WRAPPER = "0x734fb1c312dba2baa442e7d9ce55fd7a59c4e9ee";
const MAX_RETRY_ATTEMPTS = 3;

const ROLES_MOD_ABI = [
  "function execTransactionWithRole(address to, uint256 value, bytes data, uint8 operation, uint16 roleId, bool shouldRevert) external returns (bool success)",
];

const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
];

const ERC20_WRAPPER_ABI = [
  "function wrap(address to, uint256 underlyingAmount) returns (uint256 wrappedAmount)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
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

function getRoleId(): number {
  return parseInt(process.env.ROLE_KEY || "1", 10);
}

export async function getSafeCrcBalance(): Promise<{ erc1155: bigint; erc20: bigint }> {
  const provider = getProvider();
  const safeAddress = process.env.SAFE_ADDRESS;
  if (!safeAddress) throw new Error("SAFE_ADDRESS not configured");

  const hub = new ethers.Contract(CIRCLES_HUB_V2, ERC1155_ABI, provider);
  const tokenId = BigInt(NF_GROUP_ADDRESS);
  const erc1155Balance = await hub.balanceOf(safeAddress, tokenId);

  const wrapper = new ethers.Contract(NF_CRC_ERC20_WRAPPER, ERC20_WRAPPER_ABI, provider);
  const erc20Balance = await wrapper.balanceOf(safeAddress);

  return { erc1155: erc1155Balance, erc20: erc20Balance };
}

export async function getBotXdaiBalance(): Promise<string> {
  const wallet = getBotWallet();
  const balance = await wallet.provider!.getBalance(wallet.address);
  return ethers.formatEther(balance);
}

async function execViaRolesMod(
  targetAddress: string,
  calldata: string,
  value: bigint = 0n,
): Promise<ethers.TransactionReceipt> {
  const wallet = getBotWallet();
  const rolesModAddress = process.env.ROLES_MODIFIER_ADDRESS;
  if (!rolesModAddress) throw new Error("ROLES_MODIFIER_ADDRESS not configured");

  const rolesMod = new ethers.Contract(rolesModAddress, ROLES_MOD_ABI, wallet);
  const roleId = getRoleId();

  const tx = await rolesMod.execTransactionWithRole(
    targetAddress,
    value,
    calldata,
    0,
    roleId,
    true,
  );

  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) {
    throw new Error(`Transaction failed: ${tx.hash}`);
  }
  return receipt;
}

async function wrapCrc(amountWei: bigint): Promise<string> {
  const safeAddress = process.env.SAFE_ADDRESS!;
  const wrapperInterface = new ethers.Interface(ERC20_WRAPPER_ABI);
  const calldata = wrapperInterface.encodeFunctionData("wrap", [safeAddress, amountWei]);

  const receipt = await execViaRolesMod(NF_CRC_ERC20_WRAPPER, calldata);
  return receipt.hash;
}

async function transferErc20(recipient: string, amountWei: bigint): Promise<string> {
  const wrapperInterface = new ethers.Interface(ERC20_WRAPPER_ABI);
  const calldata = wrapperInterface.encodeFunctionData("transfer", [recipient, amountWei]);

  const receipt = await execViaRolesMod(NF_CRC_ERC20_WRAPPER, calldata);
  return receipt.hash;
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
    if (balance.erc1155 < amountWei && balance.erc20 < amountWei) {
      throw new Error(`Insufficient Safe balance. ERC-1155: ${ethers.formatEther(balance.erc1155)}, ERC-20: ${ethers.formatEther(balance.erc20)}, needed: ${request.amountCrc}`);
    }

    let wrapTxHash: string | undefined;
    if (balance.erc20 >= amountWei) {
      console.log(`[Payout] Safe has enough ERC-20 balance, skipping wrap`);
    } else {
      await db.update(payouts).set({
        status: "wrapping",
        updatedAt: new Date(),
      }).where(eq(payouts.id, payoutRecord.id));

      console.log(`[Payout] Wrapping ${request.amountCrc} CRC to ERC-20...`);
      wrapTxHash = await wrapCrc(amountWei);
      console.log(`[Payout] Wrap tx: ${wrapTxHash}`);

      await db.update(payouts).set({
        wrapTxHash,
        updatedAt: new Date(),
      }).where(eq(payouts.id, payoutRecord.id));
    }

    await db.update(payouts).set({
      status: "sending",
      updatedAt: new Date(),
    }).where(eq(payouts.id, payoutRecord.id));

    console.log(`[Payout] Transferring ${request.amountCrc} CRC ERC-20 to ${request.recipientAddress}...`);
    const transferTxHash = await transferErc20(request.recipientAddress, amountWei);
    console.log(`[Payout] Transfer tx: ${transferTxHash}`);

    await db.update(payouts).set({
      transferTxHash,
      status: "success",
      updatedAt: new Date(),
    }).where(eq(payouts.id, payoutRecord.id));

    return {
      success: true,
      payoutId: payoutRecord.id,
      status: "success",
      wrapTxHash,
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
