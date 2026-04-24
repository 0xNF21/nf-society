// One-shot script to apply drizzle/0002_add_real_stakes_flag_and_dao_pool.sql
// to an arbitrary DATABASE_URL. Reads creds from .env.neon by default.
// Run: node scripts/apply-pivot-migration.mjs
//
// Safe to re-run: the migration is idempotent
// (CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING).

import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const envFile = process.argv[2] || ".env.neon";
const migrationFile = "drizzle/0002_add_real_stakes_flag_and_dao_pool.sql";

function readDatabaseUrl(file) {
  const content = fs.readFileSync(file, "utf8");
  const line = content.split(/\r?\n/).find((l) => l.startsWith("DATABASE_URL="));
  if (!line) throw new Error(`No DATABASE_URL in ${file}`);
  return line.slice("DATABASE_URL=".length).replace(/^"|"$/g, "");
}

const url = readDatabaseUrl(envFile);
const sql = fs.readFileSync(migrationFile, "utf8");

// Strip drizzle's statement-breakpoint marker and execute the whole script
// as a single query. Postgres handles multi-statement scripts fine and the
// migration is idempotent (IF NOT EXISTS + ON CONFLICT).
const script = sql.replace(/--> statement-breakpoint/g, "");

console.log(`[apply-pivot] host=${new URL(url).host}`);

const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

try {
  await client.query("BEGIN");
  await client.query(script);
  await client.query("COMMIT");
  console.log("[apply-pivot] ✓ migration applied");

  const { rows: flagRows } = await client.query(
    "SELECT key, status, label, category FROM feature_flags WHERE key = 'real_stakes'",
  );
  console.log("[apply-pivot] flag:", flagRows[0]);

  const { rows: tableRows } = await client.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('dao_xp_pool', 'game_xp_events')
    ORDER BY table_name
  `);
  console.log("[apply-pivot] tables:", tableRows.map((r) => r.table_name));
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  console.error("[apply-pivot] ✗ rolled back:", err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
