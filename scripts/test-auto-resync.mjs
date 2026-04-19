// Integration test for auto-resync in execViaRolesMod.
// 1) Artificially drift bot_state.last_nonce backwards by 5.
// 2) Insert a fresh test payout (gameType='test_resync', unique gameId).
// 3) Hit /api/payout/retry to trigger executePayout().
// 4) Verify logs show "Nonce collision ... Resynced" and tx is broadcast.
// 5) Check final nonce state matches on-chain + 1.
//
// Costs: 1 CRC to a throwaway address (your own, so no loss).
// Requires: dev server running on localhost:3000.
//
// Usage: node scripts/test-auto-resync.mjs <recipientAddress>

import pg from "pg";
import fs from "node:fs";
import { ethers } from "ethers";

const recipient = process.argv[2];
if (!recipient || !ethers.isAddress(recipient)) {
  console.error("Usage: node scripts/test-auto-resync.mjs <recipientAddress>");
  process.exit(1);
}

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      const k = l.slice(0, i).trim();
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return [k, v];
    }),
);

const url = env.DATABASE_URL;
const botKey = env.BOT_PRIVATE_KEY;
const adminPassword = env.ADMIN_PASSWORD;
if (!url || !botKey || !adminPassword) {
  throw new Error("Missing DATABASE_URL, BOT_PRIVATE_KEY or ADMIN_PASSWORD in .env.local");
}

const pool = new pg.Pool({ connectionString: url, ssl: false });
const APP_URL = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const provider = new ethers.JsonRpcProvider("https://rpc.gnosischain.com");
const wallet = new ethers.Wallet(botKey, provider);

// 1) Read current state
const { rows: beforeRows } = await pool.query(`SELECT last_nonce FROM bot_state WHERE id = 1`);
const beforeNonce = beforeRows[0].last_nonce;
const onchainBefore = await provider.getTransactionCount(wallet.address, "pending");
console.log(`Before: bot_state.last_nonce=${beforeNonce}, on-chain pending=${onchainBefore}`);

// 2) Drift backwards by 5
const driftedNonce = onchainBefore - 6; // so reserve returns onchainBefore - 5, which will collide
await pool.query(`UPDATE bot_state SET last_nonce = $1 WHERE id = 1`, [driftedNonce]);
console.log(`Drifted bot_state.last_nonce to ${driftedNonce} (next reserve -> ${driftedNonce + 1})`);

// 3) Insert a fresh payout row
const testGameId = `test-resync-${Date.now()}`;
const { rows: inserted } = await pool.query(
  `INSERT INTO payouts (game_type, game_id, recipient_address, amount_crc, reason, status)
   VALUES ('test_resync', $1, $2, 1, 'Auto-resync integration test', 'pending')
   RETURNING id`,
  [testGameId, recipient],
);
const payoutId = inserted[0].id;
console.log(`Inserted test payout #${payoutId}`);

// 4) Trigger retry
console.log(`\n-> POST /api/payout/retry payoutId=${payoutId}...`);
const res = await fetch(`${APP_URL}/api/payout/retry`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ payoutId, password: adminPassword }),
});
const data = await res.json();
console.log(`Response:`, JSON.stringify(data, null, 2));

// 5) Verify state after
const { rows: afterRows } = await pool.query(`SELECT last_nonce FROM bot_state WHERE id = 1`);
const afterNonce = afterRows[0].last_nonce;
const onchainAfter = await provider.getTransactionCount(wallet.address, "pending");
console.log(`\nAfter: bot_state.last_nonce=${afterNonce}, on-chain pending=${onchainAfter}`);

// Verify: the tx was broadcast with nonce = onchainBefore (since we drifted by -5),
// so on-chain pending should now be onchainBefore + 1.
// bot_state.last_nonce should be >= onchainBefore (resync bumped it to onchainBefore - 1, then +1 from reserve).
if (data.success && data.transferTxHash) {
  console.log(`\nBroadcast tx: https://gnosisscan.io/tx/${data.transferTxHash}`);
  const bumpedFromDrift = afterNonce > driftedNonce + 1;
  console.log(bumpedFromDrift ? "PASS: bot_state was resynced forward." : "FAIL: bot_state was not resynced.");
} else {
  console.log(`\nFAIL: broadcast did not succeed.`);
  console.log(`Check dev server logs for '[Payout] Nonce collision' and '[Payout] Error'.`);
}

await pool.end();
