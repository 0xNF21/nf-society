// One-shot: create dice_tables + dice_rounds in local DB (they existed only on Neon).
import pg from "pg";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter(l => l && !l.startsWith("#") && l.includes("="))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g, "")]; }),
);

const pool = new pg.Pool({ connectionString: env.DATABASE_URL, ssl: false });
const safeAddr = env.SAFE_ADDRESS || "0x960A0784640fD6581D221A56df1c60b65b5ebB6f";

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dice_tables (
      id serial PRIMARY KEY,
      slug text NOT NULL UNIQUE,
      title text NOT NULL,
      description text,
      bet_options jsonb NOT NULL DEFAULT '[1,5,10,25]',
      recipient_address text NOT NULL,
      primary_color text NOT NULL DEFAULT '#F59E0B',
      accent_color text NOT NULL DEFAULT '#D97706',
      status text NOT NULL DEFAULT 'active',
      created_at timestamp NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dice_rounds (
      id serial PRIMARY KEY,
      table_id integer NOT NULL REFERENCES dice_tables(id),
      player_address text NOT NULL,
      transaction_hash text NOT NULL UNIQUE,
      bet_crc integer NOT NULL,
      player_token text,
      game_state jsonb NOT NULL,
      status text NOT NULL DEFAULT 'playing',
      target real,
      direction text,
      result real,
      outcome text,
      final_multiplier real,
      payout_crc real,
      payout_status text NOT NULL DEFAULT 'pending',
      payout_tx_hash text,
      error_message text,
      created_at timestamp NOT NULL DEFAULT NOW(),
      updated_at timestamp NOT NULL DEFAULT NOW()
    );
  `);
  console.log("dice_tables + dice_rounds created.");

  const existing = await pool.query(`SELECT id FROM dice_tables WHERE slug = 'classic'`);
  if (existing.rows.length === 0) {
    await pool.query(
      `INSERT INTO dice_tables (slug, title, description, bet_options, recipient_address)
       VALUES ($1, $2, $3, $4, $5)`,
      ["classic", "Dice Classic", "Devinez si le prochain tirage sera au-dessus ou en dessous de la cible.", JSON.stringify([1, 5, 10, 25]), safeAddr],
    );
    console.log("Seed: classic dice table inserted");
  } else {
    console.log("classic dice table already exists");
  }
} finally {
  await pool.end();
}
