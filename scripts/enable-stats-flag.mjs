#!/usr/bin/env node
// Insert the `public_stats` feature flag in the DB (local or Neon).
// Usage :
//   node scripts/enable-stats-flag.mjs          # local
//   node scripts/enable-stats-flag.mjs --neon   # production (needs .env.neon-temp)

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const useNeon = process.argv.includes("--neon");
const envFile = useNeon ? ".env.neon-temp" : ".env.local";
const envPath = path.join(ROOT, envFile);

if (!fs.existsSync(envPath)) {
  console.error(`Missing ${envFile}. ${useNeon ? "Run: npx vercel env pull .env.neon-temp --environment=production" : ""}`);
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envPath, "utf-8").split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[k] = v;
}

const dbUrl = env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_URL_NON_POOLING;
if (!dbUrl) { console.error("No DATABASE_URL"); process.exit(1); }

const pool = new pg.Pool({ connectionString: dbUrl, ssl: useNeon ? { rejectUnauthorized: false } : undefined });

try {
  await pool.query(`
    INSERT INTO feature_flags (key, status, label, category, updated_at)
    VALUES ('public_stats', 'enabled', 'Stats publiques', 'general', NOW())
    ON CONFLICT (key) DO UPDATE SET status = 'enabled', updated_at = NOW();
  `);
  const { rows } = await pool.query("SELECT * FROM feature_flags WHERE key = 'public_stats'");
  console.log("OK :", rows[0]);
} catch (err) {
  console.error("Failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
