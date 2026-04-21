// 1) Resync local bot_state.last_nonce with on-chain pending nonce.
// 2) Find failed nf_auth_refund payouts.
// 3) Reset attempts and retry them via /api/payout/retry (dev server must be running).
//
// Usage:
//   node scripts/resync-and-retry-nf-auth.mjs         # .env.local (default)
//   node scripts/resync-and-retry-nf-auth.mjs .env.neon

import pg from "pg";
import fs from "node:fs";
import { ethers } from "ethers";

const envFile = process.argv[2] || ".env.local";

const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8")
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
if (!url) throw new Error(`No DATABASE_URL in ${envFile}`);
if (!botKey) throw new Error(`No BOT_PRIVATE_KEY in ${envFile}`);
if (!adminPassword) throw new Error(`No ADMIN_PASSWORD in ${envFile}`);

const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });
const APP_URL = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Step 1: Fetch on-chain nonce
const provider = new ethers.JsonRpcProvider("https://rpc.gnosischain.com");
const wallet = new ethers.Wallet(botKey, provider);
const onchainPending = await provider.getTransactionCount(wallet.address, "pending");
console.log(`Bot wallet: ${wallet.address}`);
console.log(`On-chain pending nonce: ${onchainPending}`);

// Step 2: Show current local state
const { rows: before } = await pool.query(`SELECT last_nonce FROM bot_state WHERE id = 1`);
console.log(`Local bot_state.last_nonce BEFORE: ${before[0]?.last_nonce}`);

// Step 3: Resync — set last_nonce = onchainPending - 1 so next reserve returns onchainPending
const newLastNonce = onchainPending - 1;
await pool.query(
  `UPDATE bot_state SET last_nonce = $1, updated_at = NOW() WHERE id = 1`,
  [newLastNonce],
);
console.log(`Local bot_state.last_nonce AFTER: ${newLastNonce} (next reserveNonce -> ${onchainPending})`);

// Step 4: Find failed nf_auth_refund payouts
const { rows: failed } = await pool.query(
  `SELECT id, amount_crc, recipient_address, status, attempts, left(coalesce(error_message,''), 120) AS err
   FROM payouts
   WHERE game_type = 'nf_auth_refund' AND status = 'failed'
   ORDER BY id DESC`,
);
console.log(`\nFailed nf_auth_refund payouts: ${failed.length}`);
for (const r of failed) {
  console.log(`  #${r.id} ${r.amount_crc} CRC -> ${r.recipient_address} | attempts=${r.attempts}`);
  if (r.err) console.log(`      err: ${r.err}`);
}

if (failed.length === 0) {
  console.log("Nothing to retry. Done.");
  await pool.end();
  process.exit(0);
}

// Step 5: Reset attempts + trigger retry via API
const ids = failed.map(r => r.id);
await pool.query(
  `UPDATE payouts SET attempts = 0, error_message = 'Reset by resync-and-retry-nf-auth', updated_at = NOW()
   WHERE id = ANY($1::int[])`,
  [ids],
);
console.log(`\nReset attempts=0 on ${ids.length} payout(s).`);

for (const id of ids) {
  console.log(`\n-> Retrying payout #${id}...`);
  try {
    const res = await fetch(`${APP_URL}/api/payout/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payoutId: id, password: adminPassword }),
    });
    const data = await res.json();
    if (data.success) {
      console.log(`   OK broadcast: ${data.transferTxHash}`);
      console.log(`   status=${data.status} (will be confirmed by cron monitor)`);
    } else {
      console.log(`   FAILED: ${data.error || JSON.stringify(data)}`);
    }
  } catch (err) {
    console.log(`   Request error: ${err.message}`);
    console.log(`   -> Make sure 'npm run dev' is running on ${APP_URL}`);
  }
}

// Step 6: Final status
console.log(`\n=== Final status ===`);
const { rows: finalRows } = await pool.query(
  `SELECT id, amount_crc, status, attempts, transfer_tx_hash, left(coalesce(error_message,''), 150) AS err
   FROM payouts WHERE id = ANY($1::int[]) ORDER BY id`,
  [ids],
);
for (const r of finalRows) {
  console.log(`#${r.id} ${r.amount_crc} CRC | status=${r.status} | attempts=${r.attempts}`);
  if (r.transfer_tx_hash) console.log(`   tx: https://gnosisscan.io/tx/${r.transfer_tx_hash}`);
  if (r.err) console.log(`   err: ${r.err}`);
}

await pool.end();
