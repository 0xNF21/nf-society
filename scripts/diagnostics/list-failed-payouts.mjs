import pg from "pg";
import fs from "node:fs";

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

const url = env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL;
console.log(`Using ${envFile} -> ${url.replace(/:[^:@]+@/, ":***@")}\n`);

const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const pool = new pg.Pool({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

console.log("=== A) Recent lootbox payouts (last 48h, all statuses) ===\n");
const a = await pool.query(
  `SELECT id, game_id, recipient_address, amount_crc, status, attempts,
          left(coalesce(error_message,''), 220) AS err,
          created_at, updated_at, transfer_tx_hash
   FROM payouts
   WHERE game_type = 'lootbox' AND created_at >= $1
   ORDER BY created_at DESC
   LIMIT 30`,
  [since],
);
for (const r of a.rows) {
  console.log(`#${r.id} ${r.amount_crc} CRC -> ${r.recipient_address}`);
  console.log(`  status:    ${r.status} (attempts ${r.attempts})`);
  console.log(`  gameId:    ${r.game_id}`);
  console.log(`  created:   ${r.created_at.toISOString()}`);
  console.log(`  updated:   ${r.updated_at.toISOString()}`);
  console.log(`  tx:        ${r.transfer_tx_hash || "-"}`);
  if (r.err) console.log(`  error:     ${r.err}`);
  console.log();
}
if (a.rows.length === 0) console.log("(none)\n");

console.log("\n=== B) ANY payout with 'replacement' in error (last 48h) ===\n");
const b = await pool.query(
  `SELECT id, game_type, game_id, recipient_address, amount_crc, status, attempts,
          left(coalesce(error_message,''), 260) AS err, created_at
   FROM payouts
   WHERE created_at >= $1 AND error_message ILIKE '%replacement%'
   ORDER BY created_at DESC
   LIMIT 30`,
  [since],
);
for (const r of b.rows) {
  console.log(`#${r.id} [${r.game_type}] ${r.amount_crc} CRC -> ${r.recipient_address}`);
  console.log(`  status:    ${r.status} (attempts ${r.attempts})`);
  console.log(`  gameId:    ${r.game_id}`);
  console.log(`  created:   ${r.created_at.toISOString()}`);
  console.log(`  error:     ${r.err}`);
  console.log();
}
if (b.rows.length === 0) console.log("(none)\n");

console.log("\n=== C) Lootbox opens with payoutStatus != 'success' (last 48h) ===\n");
const c = await pool.query(
  `SELECT id, lootbox_id, player_address, transaction_hash, reward_crc,
          payout_status, payout_tx_hash,
          left(coalesce(error_message,''), 220) AS err,
          opened_at
   FROM lootbox_opens
   WHERE opened_at >= $1 AND payout_status <> 'success'
   ORDER BY opened_at DESC
   LIMIT 30`,
  [since],
);
for (const r of c.rows) {
  console.log(`open#${r.id} lootbox=${r.lootbox_id} reward=${r.reward_crc} CRC`);
  console.log(`  player:    ${r.player_address}`);
  console.log(`  payTx:     ${r.transaction_hash}`);
  console.log(`  status:    ${r.payout_status}`);
  console.log(`  payoutTx:  ${r.payout_tx_hash || "-"}`);
  console.log(`  opened:    ${r.opened_at.toISOString()}`);
  if (r.err) console.log(`  error:     ${r.err}`);
  console.log();
}
if (c.rows.length === 0) console.log("(none)\n");

console.log("\n=== D) ALL payouts with status != success (last 48h, any game) ===\n");
const d = await pool.query(
  `SELECT id, game_type, game_id, recipient_address, amount_crc, status, attempts,
          left(coalesce(error_message,''), 220) AS err, created_at
   FROM payouts
   WHERE created_at >= $1 AND status <> 'success'
   ORDER BY created_at DESC
   LIMIT 30`,
  [since],
);
for (const r of d.rows) {
  console.log(`#${r.id} [${r.game_type}] ${r.amount_crc} CRC status=${r.status} attempts=${r.attempts}`);
  console.log(`  gameId:  ${r.game_id}`);
  console.log(`  to:      ${r.recipient_address}`);
  console.log(`  created: ${r.created_at.toISOString()}`);
  if (r.err) console.log(`  error:   ${r.err}`);
  console.log();
}
if (d.rows.length === 0) console.log("(none)\n");

await pool.end();
