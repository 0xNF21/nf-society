// Directly call the scan endpoint and dump its findings.
// Also queries recent Safe transfers to see what's on-chain.
import fs from "node:fs";
import { ethers } from "ethers";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const SAFE = env.SAFE_ADDRESS;
console.log(`SAFE: ${SAFE}`);

// 1) Check Gnosisscan for recent incoming txs to the safe
const provider = new ethers.JsonRpcProvider("https://rpc.gnosischain.com");
const latestBlock = await provider.getBlockNumber();
console.log(`Latest block: ${latestBlock}`);

// 2) Call our scan endpoint
console.log(`\nCalling POST /api/wallet/topup-scan...`);
const res = await fetch("http://localhost:3000/api/wallet/topup-scan", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ address: "0x158a0ec28264d37b6471736f29e8f68f0c927ed5" }),
});
const data = await res.json();
console.log("Scan result:", JSON.stringify(data, null, 2));

// 3) Use the Circles indexer directly — fetch last transfers to SAFE
console.log(`\nQuerying CrcV2_TransferSingle for recent activity on SAFE...`);
const CIRCLES_RPC = "https://rpc.aboutcircles.com";
const body = {
  jsonrpc: "2.0",
  id: 1,
  method: "eth_getLogs",
  params: [{
    fromBlock: "0x" + (latestBlock - 5000).toString(16),
    toBlock: "latest",
    address: "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8", // Circles hub v2
    topics: [
      "0xc3b639f02b125bfa160e50740b851ebc8dc98d78b99c7eefde4ff7568c5b2573", // TransferSingle
      null, // operator (any)
      null, // from (any)
      "0x000000000000000000000000" + SAFE.toLowerCase().slice(2), // to = SAFE
    ],
  }],
};
const logsRes = await fetch("https://rpc.gnosis.gateway.fm/", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const logsData = await logsRes.json();
const logs = logsData.result || [];
console.log(`Found ${logs.length} recent TransferSingle logs to SAFE in last 5000 blocks`);

if (logs.length > 0) {
  console.log(`\nLast 5 txs:`);
  for (const log of logs.slice(-5)) {
    const from = "0x" + log.topics[2].slice(26);
    const blk = parseInt(log.blockNumber, 16);
    console.log(`  blk=${blk} tx=${log.transactionHash} from=${from}`);
  }
}
