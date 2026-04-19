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

const url = env.DATABASE_URL;
const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });

const { rows } = await pool.query(
  `SELECT column_name, data_type, numeric_precision
   FROM information_schema.columns
   WHERE table_name = 'payouts' AND column_name = 'amount_crc'`,
);
console.log(`[${envFile}] payouts.amount_crc:`, rows);

const { rows: last } = await pool.query(
  `SELECT id, game_type, game_id, amount_crc, status, left(coalesce(error_message,''),200) AS err, updated_at
   FROM payouts ORDER BY id DESC LIMIT 5`,
);
console.log(`\nLast 5 payouts:`);
console.table(last);

await pool.end();
