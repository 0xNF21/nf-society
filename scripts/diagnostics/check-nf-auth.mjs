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

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: envFile === ".env.neon" ? { rejectUnauthorized: false } : undefined,
});
await client.connect();

try {
  const cols = await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_name = 'nf_auth_tokens'
     ORDER BY ordinal_position`
  );
  console.log("Columns of nf_auth_tokens:");
  console.table(cols.rows);

  const idx = await client.query(
    `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'nf_auth_tokens'`
  );
  console.log("Indexes:");
  console.table(idx.rows);

  const count = await client.query(`SELECT COUNT(*)::int AS c FROM nf_auth_tokens`);
  console.log(`Row count: ${count.rows[0].c}`);
} finally {
  await client.end();
}
