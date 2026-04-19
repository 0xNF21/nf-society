// Align local payouts.amount_crc type with Neon (integer -> real).
// Also find and retrigger any orphan payout (roulette round marked as
// payoutStatus='failed' with no matching row in payouts table — typical
// symptom when the original insert choked on the type mismatch).
//
// Usage: node scripts/fix-payouts-column-local.mjs

import pg from "pg";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const url = env.DATABASE_URL;
const adminPassword = env.ADMIN_PASSWORD;
if (!url) throw new Error("No DATABASE_URL in .env.local");

const pool = new pg.Pool({ connectionString: url, ssl: false });
const APP_URL = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Step 1: ALTER TABLE if needed
const { rows: col } = await pool.query(
  `SELECT data_type FROM information_schema.columns WHERE table_name='payouts' AND column_name='amount_crc'`,
);
console.log(`Before: payouts.amount_crc = ${col[0]?.data_type}`);

if (col[0]?.data_type === "integer") {
  await pool.query(`ALTER TABLE payouts ALTER COLUMN amount_crc TYPE real USING amount_crc::real`);
  console.log(`ALTER TABLE: amount_crc is now real`);
} else {
  console.log(`No ALTER needed.`);
}

// Step 2: find roulette rounds with payoutStatus='failed' whose gameId is NOT in payouts table
const { rows: orphans } = await pool.query(`
  SELECT r.id, r.table_id, r.player_address, r.transaction_hash, r.payout_crc, r.payout_status, r.error_message
  FROM roulette_rounds r
  WHERE r.payout_status = 'failed'
    AND NOT EXISTS (
      SELECT 1 FROM payouts p
      WHERE p.game_id = CONCAT('roulette-', r.table_id, '-', r.transaction_hash)
    )
  ORDER BY r.id DESC
  LIMIT 10
`);

console.log(`\nOrphan roulette rounds (failed, no payout row): ${orphans.length}`);
for (const r of orphans) {
  console.log(`  round #${r.id} table=${r.table_id} player=${r.player_address} amount=${r.payout_crc} CRC`);
  console.log(`    tx: ${r.transaction_hash}`);
  console.log(`    err: ${(r.error_message || "").substring(0, 120)}`);
}

if (orphans.length === 0) {
  console.log("No orphan payouts. Done.");
  await pool.end();
  process.exit(0);
}

if (!adminPassword) {
  console.log("\nNo ADMIN_PASSWORD — skipping retry step. You can retry manually now via /api/payout/retry.");
  await pool.end();
  process.exit(0);
}

// Step 3: for each orphan, INSERT into payouts + retry
for (const r of orphans) {
  const gameId = `roulette-${r.table_id}-${r.transaction_hash}`;
  console.log(`\n-> Retrigger ${gameId}...`);

  const { rows: inserted } = await pool.query(
    `INSERT INTO payouts (game_type, game_id, recipient_address, amount_crc, reason, status)
     VALUES ('roulette', $1, $2, $3, $4, 'pending')
     ON CONFLICT (game_id) DO NOTHING
     RETURNING id`,
    [gameId, r.player_address, r.payout_crc, `Roulette — retrigger after schema fix`],
  );

  let payoutId;
  if (inserted.length > 0) {
    payoutId = inserted[0].id;
    console.log(`   Inserted payouts #${payoutId}`);
  } else {
    const { rows: existing } = await pool.query(`SELECT id FROM payouts WHERE game_id = $1`, [gameId]);
    payoutId = existing[0]?.id;
    console.log(`   Existing payouts #${payoutId} (reset)`);
    await pool.query(
      `UPDATE payouts SET status='failed', attempts=0, error_message='Reset for retrigger', updated_at=NOW() WHERE id=$1`,
      [payoutId],
    );
  }

  try {
    const res = await fetch(`${APP_URL}/api/payout/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payoutId, password: adminPassword }),
    });
    const data = await res.json();
    if (data.success) {
      console.log(`   OK tx: ${data.transferTxHash}`);
      // Update roulette_rounds to reflect the new broadcast
      await pool.query(
        `UPDATE roulette_rounds SET payout_status='sending', payout_tx_hash=$1, error_message=NULL, updated_at=NOW() WHERE id=$2`,
        [data.transferTxHash, r.id],
      );
    } else {
      console.log(`   FAILED: ${data.error || JSON.stringify(data)}`);
    }
  } catch (err) {
    console.log(`   Request error: ${err.message}`);
  }
}

await pool.end();
