#!/usr/bin/env node
// Migration de la table support_messages.
//
// Usage :
//   node scripts/migrate-support.mjs          # utilise .env.local (local)
//   node scripts/migrate-support.mjs --neon   # utilise .env.neon-temp (prod)
//
// Pour Neon, d'abord :
//   npx vercel env pull .env.neon-temp --environment=production
// Puis apres migration :
//   rm .env.neon-temp

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
  console.error(`Missing ${envFile} at ${envPath}`);
  if (useNeon) {
    console.error("Run first: npx vercel env pull .env.neon-temp --environment=production");
  }
  process.exit(1);
}

// Load env
const envContent = fs.readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq === -1) continue;
  const key = trimmed.slice(0, eq).trim();
  let value = trimmed.slice(eq + 1).trim();
  // Enleve les guillemets qu'ajoute vercel env pull
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

const dbUrl = env.DATABASE_URL || env.POSTGRES_URL || env.POSTGRES_URL_NON_POOLING;
if (!dbUrl) {
  console.error(`No DATABASE_URL / POSTGRES_URL found in ${envFile}`);
  process.exit(1);
}

console.log(`Target: ${useNeon ? "NEON (production)" : "LOCAL"}`);
console.log(`Using: ${Object.keys(env).filter(k => k.includes("POSTGRES") || k.includes("DATABASE")).join(", ")}`);

const pool = new pg.Pool({
  connectionString: dbUrl,
  ssl: useNeon ? { rejectUnauthorized: false } : undefined,
});

const sql = `
CREATE TABLE IF NOT EXISTS support_messages (
  id SERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  telegram_username TEXT,
  telegram_first_name TEXT,
  direction TEXT NOT NULL,
  text TEXT NOT NULL,
  admin_message_id INTEGER,
  user_message_id INTEGER,
  context JSONB,
  wallet_address TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_telegram_user ON support_messages (telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_support_admin_msg ON support_messages (admin_message_id);
CREATE INDEX IF NOT EXISTS idx_support_created_at ON support_messages (created_at DESC);

INSERT INTO feature_flags (key, status, label, category, updated_at)
VALUES ('support', 'enabled', 'Support Telegram', 'general', NOW())
ON CONFLICT (key) DO NOTHING;
`;

try {
  await pool.query(sql);
  console.log("Migration OK: support_messages table + indexes + feature flag");

  // Verif
  const { rows } = await pool.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'support_messages' ORDER BY ordinal_position"
  );
  console.log("\nColumns:");
  for (const r of rows) console.log(`  - ${r.column_name}: ${r.data_type}`);

  const flag = await pool.query("SELECT * FROM feature_flags WHERE key = 'support'");
  console.log("\nFeature flag:", flag.rows[0]);
} catch (err) {
  console.error("Migration failed:", err.message);
  process.exit(1);
} finally {
  await pool.end();
}
