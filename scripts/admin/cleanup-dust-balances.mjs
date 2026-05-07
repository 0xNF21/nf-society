// Script one-shot pour absorber le dust restant dans players.balance_crc
// apres l'execution de refund-all-balances.mjs. Le dust (balances < seuil
// negligeable) n'est pas refundable on-chain car le gas de transaction
// depasse la valeur transferee. On l'absorbe donc dans le DAO_TREASURY
// (pseudo-adresse comptable) via wallet_ledger, sans tx on-chain.
//
// Net effect :
//   - user.balance_crc → 0
//   - DAO_TREASURY.balance_crc += dust_amount
//   - Safe on-chain balance: inchange
//   - sum(players.balance_crc) invariant preserve
//
// Idempotent : safe a re-run via UNIQUE(wallet_ledger.tx_hash). Les ledger
// entries sont keyees sur des tx_hash deterministes par adresse, donc un
// re-run skip les comptes deja absorbes.
//
// Usage :
//   # 1) Preview en dry-run (defaut) :
//   ENV_FILE=.env.codex-vercel-production.local node scripts/admin/cleanup-dust-balances.mjs
//
//   # 2) Execution :
//   ENV_FILE=.env.codex-vercel-production.local DRY_RUN=false \
//     node scripts/admin/cleanup-dust-balances.mjs
//
// Variables :
//   - DRY_RUN      (defaut: "true") — "false" pour executer
//   - ENV_FILE     (defaut: ".env.local") — chemin du fichier env
//   - DUST_MAX_CRC (defaut: 0.01) — seuil dust : balance < DUST_MAX_CRC = absorbe

import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

const ENV_FILE = process.env.ENV_FILE ?? ".env.local";
const DRY_RUN = process.env.DRY_RUN !== "false";
const DUST_MAX_CRC = parseFloat(process.env.DUST_MAX_CRC ?? "0.01");

// Pseudo-adresse comptable du DAO. Ne pas confondre avec un wallet user.
// Source : src/lib/wallet-ledger.ts:DAO_TREASURY_ADDRESS.
const DAO_TREASURY_ADDRESS = "0x000000000000000000000000000000000000da00";

function loadEnv(file) {
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    console.error(`[cleanup-dust] Env file not found: ${fullPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(fullPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      const key = m[1];
      let val = m[2];
      val = val.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv(ENV_FILE);

if (!process.env.DATABASE_URL) {
  console.error("[cleanup-dust] DATABASE_URL not set");
  process.exit(1);
}

function describeDatabaseTarget(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const port = url.port ? `:${url.port}` : "";
    return `${url.protocol}//${url.hostname}${port}${url.pathname}`;
  } catch {
    return "[configured]";
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("cleanup-dust-balances");
  console.log(`  ENV_FILE        = ${ENV_FILE}`);
  console.log(`  DRY_RUN         = ${DRY_RUN}`);
  console.log(`  DUST_MAX_CRC    = ${DUST_MAX_CRC}`);
  console.log(`  DATABASE_TARGET = ${describeDatabaseTarget(process.env.DATABASE_URL)}`);
  console.log("=".repeat(60));

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("neon")
      ? { rejectUnauthorized: false }
      : false,
  });
  await client.connect();

  try {
    // List dust accounts (excluding DAO_TREASURY itself, qui est la cible
    // d'absorption et non une source).
    const dust = (
      await client.query(
        `SELECT address, balance_crc FROM players
         WHERE balance_crc > 0 AND balance_crc < $1
           AND address != $2
         ORDER BY balance_crc DESC`,
        [DUST_MAX_CRC, DAO_TREASURY_ADDRESS],
      )
    ).rows;

    if (dust.length === 0) {
      console.log("Aucun compte dust. Exit.");
      return;
    }

    const total = dust.reduce((s, a) => s + Number(a.balance_crc), 0);
    console.log(`Comptes dust         : ${dust.length}`);
    console.log(`Total CRC a absorber : ${total}`);
    console.log("");

    if (DRY_RUN) {
      console.log("--- DRY RUN preview (no changes) ---");
      for (const a of dust) {
        console.log(`  ${a.address}  ->  ${a.balance_crc} CRC (a absorber)`);
      }
      console.log("");
      console.log(`Apres execution :`);
      console.log(`  - balance_crc des ${dust.length} comptes user → 0`);
      console.log(`  - balance_crc(${DAO_TREASURY_ADDRESS}) += ${total}`);
      console.log(`  - Aucune tx on-chain (purement comptable)`);
      return;
    }

    console.log("--- LIVE execution ---");
    console.log("");

    const stats = { absorbed: 0, alreadyDone: 0, failed: 0 };

    for (let i = 0; i < dust.length; i++) {
      const acc = dust[i];
      const amount = Number(acc.balance_crc);
      const debitTxHash = `legal-pivot-dust-writeoff:${acc.address}`;
      const creditTxHash = `legal-pivot-dust-writeoff-dao:${acc.address}`;

      process.stdout.write(`[${i + 1}/${dust.length}] ${acc.address} (${amount} CRC) ... `);

      try {
        await client.query("BEGIN");

        // 1. Insert user debit ledger row. UNIQUE(tx_hash) garantit
        //    l'idempotence — un re-run renvoie 0 rows et on skip.
        const userLedger = await client.query(
          `INSERT INTO wallet_ledger
             (address, amount_crc, balance_after, kind, reason, tx_hash, game_type, created_at)
           VALUES ($1, $2, 0, 'cashout-refund', $3, $4, 'legal_pivot_dust_writeoff', NOW())
           ON CONFLICT (tx_hash) DO NOTHING
           RETURNING id`,
          [
            acc.address,
            -amount,
            "Legal pivot F2P - dust writeoff (absorbed by DAO)",
            debitTxHash,
          ],
        );

        if (userLedger.rows.length === 0) {
          await client.query("ROLLBACK");
          console.log("[SKIP] deja absorbe");
          stats.alreadyDone++;
          continue;
        }

        // 2. Zero le balance user.
        await client.query(
          `UPDATE players SET balance_crc = 0, last_seen = NOW() WHERE address = $1`,
          [acc.address],
        );

        // 3. Credit DAO_TREASURY (upsert : la pseudo-adresse a deja une row,
        //    mais l'upsert protege contre une rare absence).
        await client.query(
          `INSERT INTO players (address, xp, level, streak, last_seen, created_at, balance_crc)
           VALUES ($1, 0, 1, 0, NOW(), NOW(), $2)
           ON CONFLICT (address) DO UPDATE
           SET balance_crc = players.balance_crc + EXCLUDED.balance_crc,
               last_seen = NOW()`,
          [DAO_TREASURY_ADDRESS, amount],
        );

        // 4. Lit la nouvelle balance DAO pour ledger entry.
        const daoBalRes = await client.query(
          `SELECT balance_crc FROM players WHERE address = $1`,
          [DAO_TREASURY_ADDRESS],
        );
        const daoBalanceAfter = Number(daoBalRes.rows[0].balance_crc);

        // 5. Insert DAO credit ledger row.
        await client.query(
          `INSERT INTO wallet_ledger
             (address, amount_crc, balance_after, kind, reason, tx_hash, game_type, created_at)
           VALUES ($1, $2, $3, 'commission', $4, $5, 'legal_pivot_dust_writeoff', NOW())
           ON CONFLICT (tx_hash) DO NOTHING`,
          [
            DAO_TREASURY_ADDRESS,
            amount,
            daoBalanceAfter,
            `Dust absorbed from ${acc.address}`,
            creditTxHash,
          ],
        );

        await client.query("COMMIT");
        console.log("[OK]");
        stats.absorbed++;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.log(`[FAIL] ${err.message ?? err}`);
        stats.failed++;
      }
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("Resume :");
    console.log(`  Comptes absorbes : ${stats.absorbed}`);
    console.log(`  Deja effectue    : ${stats.alreadyDone}`);
    console.log(`  Echecs           : ${stats.failed}`);
    console.log("=".repeat(60));

    if (stats.failed > 0) process.exit(1);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[cleanup-dust-balances] Fatal:", err);
  process.exit(1);
});
