// Inspect the DAO treasury: player row + ledger entries.
// Usage: node scripts/check-treasury-state.mjs [envFile]
import pg from "pg";
import fs from "node:fs";

const envFile = process.argv[2] || ".env.local";
const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const TREASURY = (env.DAO_TREASURY_ADDRESS || "0x000000000000000000000000000000000000da00").toLowerCase();
const isLocal = /localhost|127\.0\.0\.1/.test(env.DATABASE_URL || "");
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

try {
  const { rows: player } = await pool.query(
    `SELECT address, balance_crc FROM players WHERE lower(address) = $1`,
    [TREASURY],
  );
  console.log(`Treasury player row (${TREASURY}):`);
  console.table(player.length > 0 ? player : [{ note: "no row" }]);

  const { rows: ledger } = await pool.query(
    `SELECT id, kind, amount_crc, balance_after, reason, tx_hash, game_type, game_slug, created_at
     FROM wallet_ledger WHERE lower(address) = $1 ORDER BY id DESC LIMIT 10`,
    [TREASURY],
  );
  console.log(`\nTreasury ledger (last 10):`);
  console.table(ledger.length > 0 ? ledger : [{ note: "no entries" }]);

  // Count commission rows by game_type
  const { rows: byGame } = await pool.query(
    `SELECT game_type, COUNT(*)::int AS n, COALESCE(SUM(amount_crc),0)::float AS total
     FROM wallet_ledger WHERE lower(address) = $1 AND kind = 'commission'
     GROUP BY game_type ORDER BY n DESC`,
    [TREASURY],
  );
  console.log(`\nTreasury commissions by game_type:`);
  console.table(byGame.length > 0 ? byGame : [{ note: "no commission entries" }]);

  // Also count prize ledger entries by game_type (what users actually won from balance-pay)
  const { rows: prizeCount } = await pool.query(
    `SELECT game_type, COUNT(*)::int AS n, COALESCE(SUM(amount_crc),0)::float AS total
     FROM wallet_ledger WHERE kind = 'prize' GROUP BY game_type ORDER BY n DESC`,
  );
  console.log(`\nPrize entries across all addresses:`);
  console.table(prizeCount.length > 0 ? prizeCount : [{ note: "no prize entries" }]);

  // Count debits (balance-pay bets) by game_type
  const { rows: debitCount } = await pool.query(
    `SELECT game_type, COUNT(*)::int AS n, COALESCE(SUM(amount_crc),0)::float AS total
     FROM wallet_ledger WHERE kind = 'debit' GROUP BY game_type ORDER BY n DESC`,
  );
  console.log(`\nDebit entries (bets) across all addresses:`);
  console.table(debitCount.length > 0 ? debitCount : [{ note: "no debit entries" }]);
} finally {
  await pool.end();
}
