// Sanity check on wallet state.
// - Sum of players.balance_crc (incl. treasury pseudo-address)
// - Treasury (0x...da00) balance_crc
// - For each address: verify that ledger.balance_after matches the running sum of amount_crc
// - Flag negative balances
//
// Usage: node scripts/check-wallet-invariant.mjs [envFile]
// envFile defaults to .env.local, pass .env.neon for prod.
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

const TREASURY = "0x000000000000000000000000000000000000da00";
const isLocal = /localhost|127\.0\.0\.1/.test(env.DATABASE_URL || "");
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

try {
  // 1. Total balance across all players
  const { rows: totals } = await pool.query(`
    SELECT
      COUNT(*)::int AS n_players,
      COALESCE(SUM(balance_crc), 0)::float AS total_balance,
      COUNT(*) FILTER (WHERE balance_crc < 0)::int AS n_negative,
      COUNT(*) FILTER (WHERE balance_crc > 0)::int AS n_positive
    FROM players
  `);
  console.log("Players:");
  console.table(totals);

  // 2. Treasury row
  const { rows: treasury } = await pool.query(
    `SELECT address, balance_crc FROM players WHERE lower(address) = $1`,
    [TREASURY],
  );
  console.log("\nTreasury (0x...da00):");
  console.table(treasury.length > 0 ? treasury : [{ address: TREASURY, note: "no row yet" }]);

  // 3. Negative balances (should not happen)
  const { rows: neg } = await pool.query(
    `SELECT address, balance_crc FROM players WHERE balance_crc < 0 LIMIT 10`,
  );
  if (neg.length > 0) {
    console.log("\n⚠️  Negative balances:");
    console.table(neg);
  }

  // 4. Ledger consistency per address (sample last 20 unique addresses that ledger touched)
  const { rows: addrs } = await pool.query(`
    SELECT DISTINCT address FROM wallet_ledger ORDER BY address LIMIT 20
  `);
  const driftRows = [];
  for (const { address } of addrs) {
    const { rows: lastLedger } = await pool.query(
      `SELECT balance_after FROM wallet_ledger
         WHERE address = $1 ORDER BY id DESC LIMIT 1`,
      [address],
    );
    const { rows: playerBal } = await pool.query(
      `SELECT balance_crc FROM players WHERE address = $1`,
      [address],
    );
    const ledgerLast = lastLedger[0]?.balance_after ?? null;
    const playerBalance = playerBal[0]?.balance_crc ?? null;
    const drift =
      ledgerLast !== null && playerBalance !== null
        ? Math.abs(Number(ledgerLast) - Number(playerBalance))
        : null;
    const ok = drift === null ? "n/a" : drift < 0.000001 ? "ok" : "DRIFT";
    if (ok === "DRIFT") {
      driftRows.push({ address, ledgerLast, playerBalance, drift });
    }
  }
  if (driftRows.length > 0) {
    console.log("\n⚠️  Ledger/player balance drift:");
    console.table(driftRows);
  } else {
    console.log(`\n✅ Ledger/player balance matches for all ${addrs.length} sampled addresses.`);
  }

  // 5. Per-address running sum check (top 5 active addresses)
  const { rows: top } = await pool.query(`
    SELECT address, COUNT(*)::int AS n_entries
    FROM wallet_ledger GROUP BY address ORDER BY n_entries DESC LIMIT 5
  `);
  console.log("\nTop 5 addresses by ledger activity:");
  console.table(top);

  for (const { address } of top) {
    const { rows: entries } = await pool.query(
      `SELECT amount_crc, balance_after FROM wallet_ledger
         WHERE address = $1 ORDER BY id ASC`,
      [address],
    );
    let running = 0;
    let mismatch = 0;
    for (const e of entries) {
      running += Number(e.amount_crc);
      if (Math.abs(running - Number(e.balance_after)) > 0.000001) {
        mismatch++;
      }
    }
    console.log(`  ${address}: ${entries.length} entries, final running=${running.toFixed(6)}, mismatches=${mismatch}`);
  }
} finally {
  await pool.end();
}
