// Compare all *_crc column types between local and Neon to find drift.
import pg from "pg";
import fs from "node:fs";

async function getSchema(envFile) {
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
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND column_name LIKE '%crc%'
     ORDER BY table_name, column_name`,
  );
  await pool.end();
  const map = new Map();
  for (const r of rows) map.set(`${r.table_name}.${r.column_name}`, r.data_type);
  return map;
}

const local = await getSchema(".env.local");
const neon = await getSchema(".env.neon");

const all = new Set([...local.keys(), ...neon.keys()]);
const diffs = [];
for (const k of [...all].sort()) {
  const l = local.get(k) || "(missing)";
  const n = neon.get(k) || "(missing)";
  if (l !== n) diffs.push({ column: k, local: l, neon: n });
}

console.log(`Total columns matching *crc*: ${all.size}`);
console.log(`Schema drifts: ${diffs.length}`);
if (diffs.length) console.table(diffs);
