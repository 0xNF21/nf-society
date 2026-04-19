import pg from "pg";
import * as dotenv from "dotenv";
import { readFileSync } from "fs";
import { resolve } from "path";

const envFile = process.argv[2] === "--neon" ? ".env.neon" : ".env.local";
dotenv.config({ path: resolve(process.cwd(), envFile) });

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(`No DATABASE_URL found in ${envFile}`);
  process.exit(1);
}

console.log(`Using ${envFile} → ${dbUrl.replace(/\/\/.*@/, "//***@")}`);

const sql = readFileSync(resolve(process.cwd(), "drizzle/0009_add_nf_auth_tokens.sql"), "utf-8");

const client = new pg.Client({ connectionString: dbUrl, ssl: envFile === ".env.neon" ? { rejectUnauthorized: false } : undefined });
await client.connect();

try {
  await client.query(sql);
  console.log("nf_auth_tokens table created");
} catch (err) {
  console.error("Error:", err.message);
  process.exit(1);
} finally {
  await client.end();
}
