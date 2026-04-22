// One-shot script to repair the 14 CRC lost in local during the race-condition repro.
// Resets payouts #63 and #64 to pending, then triggers the dev server's retry endpoint.
//
// Prerequisites:
//   - npm run dev MUST be running on http://localhost:3000
//   - bot_state must be bootstrapped: node scripts/init-bot-nonce.mjs
//   - .env.local must contain ADMIN_PASSWORD
//
// Usage:
//   node scripts/repair-failed-payouts.mjs

import pg from "pg";
import fs from "node:fs";

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

const url = env.DATABASE_URL || env.POSTGRES_URL;
const adminPassword = env.ADMIN_PASSWORD;
if (!url) throw new Error("No DATABASE_URL in .env.local");
if (!adminPassword) throw new Error("No ADMIN_PASSWORD in .env.local");

const pool = new pg.Pool({ connectionString: url, ssl: false });
const TARGET_IDS = [63, 64];
const APP_URL = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// 1) Reset attempts so retryPayout doesn't bail on max_retries
const updateRes = await pool.query(
  `UPDATE payouts SET attempts = 0, status = 'failed', error_message = 'Reset for repair', updated_at = NOW()
   WHERE id = ANY($1::int[]) AND status NOT IN ('success', 'sending')
   RETURNING id, amount_crc, recipient_address, attempts, status`,
  [TARGET_IDS],
);
console.log(`✓ Reset ${updateRes.rowCount} row(s):`);
for (const r of updateRes.rows) {
  console.log(`  #${r.id} ${r.amount_crc} CRC -> ${r.recipient_address}`);
}

// 2) For each, hit /api/payout/retry
for (const id of TARGET_IDS) {
  console.log(`\n→ Retrying #${id}...`);
  try {
    const res = await fetch(`${APP_URL}/api/payout/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payoutId: id, password: adminPassword }),
    });
    const data = await res.json();
    if (data.success) {
      console.log(`  ✓ Broadcast OK — tx: ${data.transferTxHash}`);
      console.log(`  Status DB: ${data.status} (will be confirmed by cron monitor)`);
    } else {
      console.log(`  ✗ Failed: ${data.error || JSON.stringify(data)}`);
    }
  } catch (err) {
    console.log(`  ✗ Request error: ${err.message}`);
    console.log(`  → Make sure 'npm run dev' is running on ${APP_URL}`);
  }
}

console.log(`\n=== Final status ===`);
const final = await pool.query(
  `SELECT id, amount_crc, status, attempts, transfer_tx_hash, left(coalesce(error_message,''), 150) AS err
   FROM payouts WHERE id = ANY($1::int[]) ORDER BY id`,
  [TARGET_IDS],
);
for (const r of final.rows) {
  console.log(`#${r.id} ${r.amount_crc} CRC | status=${r.status} | attempts=${r.attempts}`);
  if (r.transfer_tx_hash) console.log(`   tx: ${r.transfer_tx_hash}`);
  if (r.err) console.log(`   err: ${r.err}`);
}

console.log(`\nNext: hit GET ${APP_URL}/api/cron/payouts-monitor to confirm the broadcasts.`);
await pool.end();
