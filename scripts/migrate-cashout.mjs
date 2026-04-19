// Create cashout_tokens table on local or Neon.
// Usage:
//   node scripts/migrate-cashout.mjs                    # .env.local
//   node scripts/migrate-cashout.mjs --neon             # .env.neon
//   node scripts/migrate-cashout.mjs .env.neon-temp     # custom env file
import pg from "pg";
import fs from "node:fs";

const args = process.argv.slice(2);
const isNeon = args.includes("--neon");
const customEnvFile = args.find((a) => !a.startsWith("--") && a.endsWith(".env") || a.includes(".env"));
const envFile = customEnvFile || (isNeon ? ".env.neon" : ".env.local");
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const isLocal = /localhost|127\.0\.0\.1/.test(env.DATABASE_URL || "");
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

try {
  console.log(`Migrating cashout_tokens using ${envFile} (${isLocal ? "local" : "remote/Neon"})...`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS cashout_tokens (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      amount_crc REAL NOT NULL,
      address TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      proof_tx_hash TEXT,
      payout_tx_hash TEXT,
      refund_tx_hash TEXT,
      error_message TEXT,
      debit_ledger_id TEXT,
      refund_ledger_id TEXT,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS cashout_tokens_token_idx ON cashout_tokens(token)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS cashout_tokens_address_idx ON cashout_tokens(address)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS cashout_tokens_status_idx ON cashout_tokens(status)`);

  const { rows } = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'cashout_tokens' ORDER BY ordinal_position
  `);
  console.log(`cashout_tokens columns:`);
  console.table(rows);
} finally {
  await pool.end();
}
