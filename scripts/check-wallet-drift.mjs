// Quantify the wallet balance drift: compare expected balances from ledger
// sums vs stored balance_crc, and show where CRC was created/destroyed.
//
// Usage: node scripts/check-wallet-drift.mjs [envFile]
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

const isLocal = /localhost|127\.0\.0\.1/.test(env.DATABASE_URL || "");
const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

try {
  // Totals by ledger kind
  const { rows: byKind } = await pool.query(`
    SELECT kind, COUNT(*)::int AS n, COALESCE(SUM(amount_crc), 0)::float AS total
    FROM wallet_ledger GROUP BY kind ORDER BY kind
  `);
  console.log("Ledger totals by kind:");
  console.table(byKind);

  // Sum of all ledger amounts (should equal sum of balances if perfect)
  const { rows: sumLedger } = await pool.query(`
    SELECT COALESCE(SUM(amount_crc), 0)::float AS ledger_total FROM wallet_ledger
  `);
  const { rows: sumBalance } = await pool.query(`
    SELECT COALESCE(SUM(balance_crc), 0)::float AS balance_total FROM players
  `);
  const ledgerTotal = sumLedger[0]?.ledger_total ?? 0;
  const balanceTotal = sumBalance[0]?.balance_total ?? 0;
  console.log(`\nLedger sum:   ${ledgerTotal.toFixed(6)}`);
  console.log(`Balance sum:  ${balanceTotal.toFixed(6)}`);
  console.log(`Delta:        ${(balanceTotal - ledgerTotal).toFixed(6)} (should be ~0)`);

  // Breakdown of expected "hidden" drift from balance-pay chance games
  // = debit amounts (vanished) + prize amounts from balance-paid rounds (conjured)
  // To detect balance-paid prizes, check tx_hash prefix 'prize:' AND game_type in chance
  // Since we don't store sourceTxHash on the prize ledger, we infer via presence
  // of a matching debit row for the same address+game_type.

  const { rows: topupTotal } = await pool.query(`
    SELECT COALESCE(SUM(amount_crc), 0)::float AS total FROM wallet_ledger WHERE kind = 'topup'
  `);
  const { rows: debitTotal } = await pool.query(`
    SELECT COALESCE(SUM(amount_crc), 0)::float AS total FROM wallet_ledger WHERE kind = 'debit'
  `);
  const { rows: prizeTotal } = await pool.query(`
    SELECT COALESCE(SUM(amount_crc), 0)::float AS total FROM wallet_ledger WHERE kind = 'prize'
  `);
  const { rows: commissionTotal } = await pool.query(`
    SELECT COALESCE(SUM(amount_crc), 0)::float AS total FROM wallet_ledger WHERE kind = 'commission'
  `);
  const { rows: houseBetTotal } = await pool.query(`
    SELECT COALESCE(SUM(amount_crc), 0)::float AS total FROM wallet_ledger WHERE kind = 'house-bet'
  `);
  const { rows: housePayoutTotal } = await pool.query(`
    SELECT COALESCE(SUM(amount_crc), 0)::float AS total FROM wallet_ledger WHERE kind = 'house-payout'
  `);

  console.log(`\nAccounting picture:`);
  console.log(`  Topups in:        ${topupTotal[0].total.toFixed(6)}  (CRC from on-chain -> balances)`);
  console.log(`  Debits out:       ${debitTotal[0].total.toFixed(6)}  (user bets debited)`);
  console.log(`  Prizes credited:  ${prizeTotal[0].total.toFixed(6)}  (balance-pay wins)`);
  console.log(`  Commission to T:  ${commissionTotal[0].total.toFixed(6)}  (multi-game commission)`);
  console.log(`  House-bet to T:   ${houseBetTotal[0].total.toFixed(6)}  (treasury receives bet)`);
  console.log(`  House-payout T:   ${housePayoutTotal[0].total.toFixed(6)}  (treasury pays prize)`);

  const expected =
    Number(topupTotal[0].total) +
    Number(debitTotal[0].total) +
    Number(prizeTotal[0].total) +
    Number(commissionTotal[0].total) +
    Number(houseBetTotal[0].total) +
    Number(housePayoutTotal[0].total);
  console.log(`\nExpected sum of balances: ${expected.toFixed(6)}`);
  console.log(`Actual sum of balances:   ${balanceTotal.toFixed(6)}`);
  console.log(`Drift:                    ${(balanceTotal - expected).toFixed(6)}`);

  // Fraction of drift from chance games (hypothesis: all drift is chance)
  const chanceGameDebits = await pool.query(`
    SELECT COALESCE(SUM(amount_crc),0)::float AS total FROM wallet_ledger
    WHERE kind='debit' AND game_type IN ('roulette','hilo','blackjack','dice','plinko','mines','keno','crash_dash')
  `);
  const chanceGamePrizes = await pool.query(`
    SELECT COALESCE(SUM(amount_crc),0)::float AS total FROM wallet_ledger
    WHERE kind='prize' AND game_type IN ('roulette','hilo','blackjack','dice','plinko','mines','keno','crash_dash')
  `);
  console.log(`\nChance games only:`);
  console.log(`  Debits:  ${chanceGameDebits.rows[0].total.toFixed(6)}`);
  console.log(`  Prizes:  ${chanceGamePrizes.rows[0].total.toFixed(6)}`);
  console.log(`  Net (prize - |debit|): ${(
    Number(chanceGamePrizes.rows[0].total) + Number(chanceGameDebits.rows[0].total)
  ).toFixed(6)} CRC "created" via chance-game balance-pay (should be 0 if invariant held)`);
} finally {
  await pool.end();
}
