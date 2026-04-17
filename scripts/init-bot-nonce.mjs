// Bootstrap the bot_state table with the bot wallet's current on-chain nonce.
// Run once per environment (local + Neon prod). Safe to re-run — uses INSERT ... ON CONFLICT DO NOTHING.
//
// Usage:
//   node scripts/init-bot-nonce.mjs                  # uses .env.local
//   node scripts/init-bot-nonce.mjs .env.neon        # uses Neon prod

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

const url = env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_PRISMA_URL;
const botKey = env.BOT_PRIVATE_KEY;
if (!url) throw new Error(`No DATABASE_URL in ${envFile}`);
if (!botKey) throw new Error(`No BOT_PRIVATE_KEY in ${envFile}`);

const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });

console.log(`Using ${envFile}`);

// Ensure table exists (idempotent)
await pool.query(`
  CREATE TABLE IF NOT EXISTS bot_state (
    id          INTEGER PRIMARY KEY DEFAULT 1,
    last_nonce  INTEGER NOT NULL,
    updated_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    CHECK (id = 1)
  )
`);
console.log("✓ bot_state table ensured");

// Fetch current nonce from Gnosis
const provider = new ethers.JsonRpcProvider("https://rpc.gnosischain.com");
const wallet = new ethers.Wallet(botKey, provider);
const onchainNonce = await provider.getTransactionCount(wallet.address, "pending");
console.log(`Bot wallet: ${wallet.address}`);
console.log(`On-chain nonce (pending): ${onchainNonce}`);

// We store last_nonce = onchainNonce - 1 so that the first reserveNonce() call
// returns onchainNonce (next free nonce).
const initialLastNonce = onchainNonce - 1;

const insertRes = await pool.query(
  `INSERT INTO bot_state (id, last_nonce) VALUES (1, $1) ON CONFLICT (id) DO NOTHING RETURNING last_nonce`,
  [initialLastNonce],
);

if (insertRes.rowCount === 0) {
  const { rows } = await pool.query(`SELECT last_nonce FROM bot_state WHERE id = 1`);
  console.log(`✓ bot_state already exists (last_nonce=${rows[0]?.last_nonce}). Skipping.`);
  console.log(`  If you need to reset to ${initialLastNonce}, run:`);
  console.log(`  UPDATE bot_state SET last_nonce = ${initialLastNonce} WHERE id = 1;`);
} else {
  console.log(`✓ bot_state initialized with last_nonce=${initialLastNonce} (next reserved = ${onchainNonce})`);
}

await pool.end();
