// Check if a Gnosis tx is confirmed.
import { ethers } from "ethers";

const hash = process.argv[2];
if (!hash) {
  console.error("Usage: node scripts/check-tx.mjs <txHash>");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider("https://rpc.gnosischain.com");
const receipt = await provider.getTransactionReceipt(hash);

if (!receipt) {
  console.log(`Tx ${hash}: NOT YET MINED (still pending)`);
  process.exit(0);
}

console.log(`Tx ${hash}`);
console.log(`  Block: ${receipt.blockNumber}`);
console.log(`  Status: ${receipt.status === 1 ? "SUCCESS" : "REVERTED"}`);
console.log(`  From: ${receipt.from}`);
console.log(`  To: ${receipt.to}`);
console.log(`  Gas used: ${receipt.gasUsed}`);
