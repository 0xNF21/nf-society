// Phase 3a — Wallet foundations migration.
// Creates wallet_ledger table and adds players.balance_crc column.
//
// Usage:
//   node scripts/migrate-wallet.mjs          # .env.local
//   node scripts/migrate-wallet.mjs --neon   # .env.neon

import pg from "pg";
import { readFileSync } from "fs";
import { resolve } from "path";

const envFile = process.argv[2] === "--neon" ? ".env.neon" : ".env.local";

function loadEnv(path) {
  const text = readFileSync(path, "utf-8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnv(resolve(process.cwd(), envFile));

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(`No DATABASE_URL found in ${envFile}`);
  process.exit(1);
}

console.log(`Using ${envFile} → ${dbUrl.replace(/\/\/.*@/, "//***@")}`);

const sql = readFileSync(resolve(process.cwd(), "drizzle/0010_add_wallet.sql"), "utf-8");

const client = new pg.Client({
  connectionString: dbUrl,
  ssl: envFile === ".env.neon" ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

try {
  await client.query(sql);
  console.log("wallet_ledger table created + players.balance_crc added");

  // Verification
  const { rows: cols } = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'wallet_ledger' ORDER BY ordinal_position`,
  );
  console.log(`\nwallet_ledger columns (${cols.length}):`);
  for (const c of cols) console.log(`  ${c.column_name.padEnd(16)} ${c.data_type}`);

  const { rows: playerCol } = await client.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_name = 'players' AND column_name = 'balance_crc'`,
  );
  console.log(`\nplayers.balance_crc type: ${playerCol[0]?.data_type || "(missing)"}`);
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
