// Inspect wallet state for an address on local DB.
// Usage: node scripts/check-wallet-state.mjs [address]
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

const address = (process.argv[2] || "0x158a0ec28264d37b6471736f29e8f68f0c927ed5").toLowerCase();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: false });

const { rows: player } = await pool.query(
  `SELECT address, balance_crc, xp, level, last_seen FROM players WHERE address = $1`,
  [address],
);
console.log(`Player row for ${address}:`);
console.table(player);

const { rows: ledger } = await pool.query(
  `SELECT id, kind, amount_crc, balance_after, reason, tx_hash, game_type, created_at
   FROM wallet_ledger WHERE address = $1 ORDER BY id DESC LIMIT 10`,
  [address],
);
console.log(`\nLast 10 ledger entries:`);
console.table(ledger);

await pool.end();
