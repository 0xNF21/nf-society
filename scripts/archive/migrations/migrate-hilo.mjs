import pg from "pg";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

// Load env
const envFile = process.argv[2] === "--neon" ? ".env.neon" : ".env.local";
dotenv.config({ path: resolve(process.cwd(), envFile) });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(`No DATABASE_URL found in ${envFile}`);
  process.exit(1);
}

console.log(`Using ${envFile} → ${dbUrl.replace(/\/\/.*@/, "//***@")}`);

const sql = readFileSync(resolve(process.cwd(), "drizzle/0004_add_hilo_tables.sql"), "utf-8");

const client = new pg.Client({ connectionString: dbUrl, ssl: envFile === ".env.neon" ? { rejectUnauthorized: false } : undefined });
await client.connect();

try {
  await client.query(sql);
  console.log("✅ hilo_tables + hilo_rounds created");

  // Seed classic table if not exists
  const safeAddr = process.env.SAFE_ADDRESS;
  if (safeAddr) {
    const existing = await client.query("SELECT id FROM hilo_tables WHERE slug = 'classic'");
    if (existing.rows.length === 0) {
      await client.query(
        `INSERT INTO hilo_tables (slug, title, description, bet_options, recipient_address) VALUES ($1, $2, $3, $4, $5)`,
        ["classic", "Hi-Lo Classic", "Devinez si la prochaine carte est plus haute ou plus basse. RTP ~97%.", JSON.stringify([1, 5, 10, 25]), safeAddr]
      );
      console.log("✅ Seed: classic Hi-Lo table inserted");
    } else {
      console.log("ℹ️ classic Hi-Lo table already exists");
    }
  } else {
    console.log("⚠️ No SAFE_ADDRESS in env, skipping seed. Add it manually via POST /api/hilo");
  }
} catch (err) {
  console.error("❌ Error:", err.message);
} finally {
  await client.end();
}
