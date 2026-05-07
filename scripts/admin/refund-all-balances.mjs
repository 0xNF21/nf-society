// Script one-shot pour rembourser le solde balance_crc actif de chaque
// joueur, suite au pivot legal F2P (PR #45). Chaque player recoit en CRC
// on-chain (via Safe + Roles Modifier) le contenu de son balance_crc, qui
// est ensuite mis a 0.
//
// Idempotent : safe a re-run. Les wallet_ledger entries sont keyees sur
// un tx_hash deterministe par adresse (UNIQUE constraint), et les payouts
// sur un game_id deterministe (UNIQUE constraint).
//
// Hors scope : les CRC engages dans des parties actives (deja debites de
// balance_crc, stockes dans game.bet_crc). Voir PR2 pour ce flux.
//
// Usage :
//   # 1) Preview en dry-run (defaut) :
//   node scripts/admin/refund-all-balances.mjs
//
//   # 2) Execution reelle :
//   DRY_RUN=false node scripts/admin/refund-all-balances.mjs
//
//   # 3) Cibler la prod Neon depuis local :
//   npx vercel env pull .env.neon
//   ENV_FILE=.env.neon DRY_RUN=false node scripts/admin/refund-all-balances.mjs
//   rm .env.neon
//
// Pre-flight (env file requis avec ces variables) :
//   - DATABASE_URL
//   - SAFE_ADDRESS
//   - BOT_PRIVATE_KEY
//   - ROLES_MODIFIER_ADDRESS
//   - ROLE_KEY
//
// Variables optionnelles :
//   - DRY_RUN          (defaut: "true") — "false" pour executer reellement
//   - DELAY_MS         (defaut: 1500) — delai entre payouts (RPC throttle)
//   - ENV_FILE         (defaut: ".env.local") — chemin du fichier env
//   - MAX_PAYOUT_CRC   (defaut: 10000) — plafond de securite par compte
//   - MIN_REFUND_CRC   (defaut: 0) — seuil minimum pour eviter le dust

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { ethers } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────
// Config + env loading
// ─────────────────────────────────────────────────────────────────────────

const ENV_FILE = process.env.ENV_FILE ?? ".env.local";
const DRY_RUN = process.env.DRY_RUN !== "false";
const DELAY_MS = parseInt(process.env.DELAY_MS ?? "1500", 10);
const MAX_PAYOUT_CRC = parseInt(process.env.MAX_PAYOUT_CRC ?? "10000", 10);
const MIN_REFUND_CRC = parseFloat(process.env.MIN_REFUND_CRC ?? "0");

function loadEnv(file) {
  const fullPath = path.resolve(process.cwd(), file);
  if (!fs.existsSync(fullPath)) {
    console.error(`[refund] Env file not found: ${fullPath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(fullPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) {
      const key = m[1];
      let val = m[2];
      // Strip surrounding quotes if present
      val = val.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

loadEnv(ENV_FILE);

const REQUIRED = ["DATABASE_URL", "SAFE_ADDRESS", "BOT_PRIVATE_KEY", "ROLES_MODIFIER_ADDRESS", "ROLE_KEY"];
const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(`[refund] Missing env vars: ${missing.join(", ")}`);
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

// ─────────────────────────────────────────────────────────────────────────
// Constants (mirror src/lib/payout.ts)
// ─────────────────────────────────────────────────────────────────────────

const GNOSIS_RPC = "https://rpc.gnosischain.com";
const CIRCLES_HUB_V2 = "0xc12C1E50ABB450d6205Ea2C3Fa861b3B834d13e8";
const NF_GROUP_ADDRESS = "0x7dd9f44c7f1a6788221a92305f9e7ea790675e9b";
const NF_TOKEN_ID = BigInt(NF_GROUP_ADDRESS);

const ROLES_MOD_ABI = [
  "function execTransactionWithRole(address to, uint256 value, bytes data, uint8 operation, bytes32 roleKey, bool shouldRevert) external returns (bool success)",
];

const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)",
];

function getRoleKey() {
  const key = process.env.ROLE_KEY;
  if (key.startsWith("0x")) return key.padEnd(66, "0").slice(0, 66);
  return "0x" + BigInt(key).toString(16).padStart(64, "0");
}

// Pseudo-adresses systeme a NE PAS inclure dans les refunds.
// Ce sont des compteurs comptables virtuels, pas des wallets utilisateur.
// Toute tentative de transfer ERC-1155 vers ces adresses partirait dans
// le neant (pas de proprietaire / pas de smart contract qui recoit).
const SYSTEM_ADDRESSES = new Set([
  "0x000000000000000000000000000000000000da00", // DAO_TREASURY_ADDRESS (wallet-ledger.ts)
  "0x0000000000000000000000000000000000000000", // zero address (safety)
]);

// ─────────────────────────────────────────────────────────────────────────
// On-chain helpers
// ─────────────────────────────────────────────────────────────────────────

const provider = new ethers.JsonRpcProvider(GNOSIS_RPC);
const wallet = new ethers.Wallet(process.env.BOT_PRIVATE_KEY, provider);

async function getSafeCrcBalanceWei() {
  const hub = new ethers.Contract(CIRCLES_HUB_V2, ERC1155_ABI, provider);
  return await hub.balanceOf(process.env.SAFE_ADDRESS, NF_TOKEN_ID);
}

/**
 * Atomic nonce reservation via PG. Two concurrent broadcasts cannot get
 * the same value, which prevents "replacement fee too low" races.
 * Mirror de src/lib/payout.ts:reserveNonce.
 */
async function reserveNonce(client) {
  const r = await client.query(
    `UPDATE bot_state SET last_nonce = last_nonce + 1, updated_at = NOW()
     WHERE id = 1 RETURNING last_nonce`,
  );
  if (r.rows.length === 0 || typeof r.rows[0].last_nonce !== "number") {
    throw new Error("bot_state row missing - run scripts/ops/init-bot-nonce.mjs first");
  }
  return r.rows[0].last_nonce;
}

async function broadcastTransfer(client, recipient, amountWei) {
  const safeAddress = process.env.SAFE_ADDRESS;
  const hubInterface = new ethers.Interface(ERC1155_ABI);
  const calldata = hubInterface.encodeFunctionData("safeTransferFrom", [
    safeAddress,
    recipient,
    NF_TOKEN_ID,
    amountWei,
    "0x",
  ]);

  const rolesMod = new ethers.Contract(process.env.ROLES_MODIFIER_ADDRESS, ROLES_MOD_ABI, wallet);
  const nonce = await reserveNonce(client);
  const tx = await rolesMod.execTransactionWithRole(
    CIRCLES_HUB_V2,
    0n,
    calldata,
    0, // operation: CALL
    getRoleKey(),
    true, // shouldRevert
    { nonce },
  );
  return tx.hash;
}

// ─────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log(`refund-all-balances`);
  console.log(`  ENV_FILE        = ${ENV_FILE}`);
  console.log(`  DRY_RUN         = ${DRY_RUN}`);
  console.log(`  DELAY_MS        = ${DELAY_MS}`);
  console.log(`  MAX_PAYOUT_CRC  = ${MAX_PAYOUT_CRC}`);
  console.log(`  MIN_REFUND_CRC  = ${MIN_REFUND_CRC}`);
  console.log(`  DATABASE_TARGET = ${describeDatabaseTarget(process.env.DATABASE_URL)}`);
  console.log(`  SAFE_ADDRESS    = ${process.env.SAFE_ADDRESS}`);
  console.log("=".repeat(60));

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("neon")
      ? { rejectUnauthorized: false }
      : false,
  });
  await client.connect();

  try {
    // List players with balance above threshold, biggest first.
    // Filtre les pseudo-adresses systeme (DAO treasury, zero address, etc.)
    // qui sont des compteurs comptables et non de vrais wallets.
    const allAccounts = (
      await client.query(
        `SELECT address, balance_crc FROM players
         WHERE balance_crc > $1 ORDER BY balance_crc DESC`,
        [MIN_REFUND_CRC],
      )
    ).rows;

    const skipped = allAccounts.filter((a) => SYSTEM_ADDRESSES.has(a.address));
    const accounts = allAccounts.filter((a) => !SYSTEM_ADDRESSES.has(a.address));

    if (skipped.length > 0) {
      console.log("--- Pseudo-adresses systeme exclues (non-refundable) ---");
      for (const s of skipped) {
        console.log(`  ${s.address}  (${s.balance_crc} CRC) [SYSTEM, skipped]`);
      }
      console.log("");
    }

    if (accounts.length === 0) {
      console.log("Aucun compte avec balance_crc > 0. Exit.");
      return;
    }

    const total = accounts.reduce((s, a) => s + Number(a.balance_crc), 0);
    console.log(`Comptes a rembourser : ${accounts.length}`);
    console.log(`Total CRC            : ${total}`);
    console.log("");

    // Pre-flight: check Safe balance is sufficient.
    const safeBalanceWei = await getSafeCrcBalanceWei();
    const requiredWei = ethers.parseEther(String(total));
    console.log(`Safe ERC-1155 balance: ${ethers.formatEther(safeBalanceWei)} CRC`);
    if (safeBalanceWei < requiredWei) {
      console.error(`[refund] Safe insufficient: have ${ethers.formatEther(safeBalanceWei)}, need ${total}`);
      process.exit(1);
    }
    console.log("");

    if (DRY_RUN) {
      console.log("--- DRY RUN preview (no changes) ---");
      for (const a of accounts) {
        console.log(`  ${a.address}  ->  ${a.balance_crc} CRC`);
      }
      console.log("");
      console.log("Re-run avec DRY_RUN=false pour executer reellement.");
      return;
    }

    console.log("--- LIVE execution ---");
    console.log("");

    const stats = { paid: 0, alreadyDone: 0, failed: 0 };

    for (let i = 0; i < accounts.length; i++) {
      const acc = accounts[i];
      const address = acc.address;
      const amount = Number(acc.balance_crc);

      // Plafond de securite par compte.
      if (amount > MAX_PAYOUT_CRC) {
        console.log(`[${i + 1}/${accounts.length}] ${address} (${amount} CRC) [SKIP] depasse MAX_PAYOUT_CRC=${MAX_PAYOUT_CRC}`);
        stats.failed++;
        continue;
      }

      const refundTxHash = `legal-pivot-refund:${address}`;
      const payoutGameId = `legal-pivot-refund-${address}`;

      process.stdout.write(`[${i + 1}/${accounts.length}] ${address} (${amount} CRC) ... `);

      try {
        // Phase 1 — debit atomique balance + ledger.
        // wallet_ledger.tx_hash UNIQUE = idempotent au re-run.
        let alreadyDebited = false;
        await client.query("BEGIN");
        try {
          // Insert ledger row first. Si UNIQUE viole, le debit a deja eu lieu.
          const ledgerRes = await client.query(
            `INSERT INTO wallet_ledger
               (address, amount_crc, balance_after, kind, reason, tx_hash, game_type, created_at)
             VALUES ($1, $2, 0, 'cashout-refund', $3, $4, 'legal_pivot_refund', NOW())
             ON CONFLICT (tx_hash) DO NOTHING
             RETURNING id`,
            [address, -amount, "Legal pivot F2P - auto refund balance", refundTxHash],
          );
          if (ledgerRes.rows.length === 0) {
            // Conflit UNIQUE → ledger deja la
            alreadyDebited = true;
          } else {
            // Met le balance a 0.
            await client.query(
              `UPDATE players SET balance_crc = 0, last_seen = NOW() WHERE address = $1`,
              [address],
            );
          }
          await client.query("COMMIT");
        } catch (e) {
          await client.query("ROLLBACK");
          throw e;
        }

        // Phase 2 — payout on-chain.
        // payouts.game_id UNIQUE = idempotent au re-run.
        let payoutId;
        const existingPayout = await client.query(
          `SELECT id, status, transfer_tx_hash, attempts FROM payouts WHERE game_id = $1`,
          [payoutGameId],
        );
        if (existingPayout.rows.length > 0) {
          const ex = existingPayout.rows[0];
          if (ex.status === "success") {
            console.log(`[SKIP] payout deja confirme (tx ${ex.transfer_tx_hash})`);
            stats.alreadyDone++;
            continue;
          }
          if (ex.status === "sending") {
            console.log(`[SKIP] payout en cours de confirmation (tx ${ex.transfer_tx_hash})`);
            stats.alreadyDone++;
            continue;
          }
          // status='failed' ou 'pending' → on retry
          payoutId = ex.id;
          await client.query(
            `UPDATE payouts SET status='pending', error_message=NULL, updated_at=NOW() WHERE id=$1`,
            [payoutId],
          );
        } else {
          const insertRes = await client.query(
            `INSERT INTO payouts
               (game_type, game_id, recipient_address, amount_crc, reason, status, attempts, created_at, updated_at)
             VALUES ('legal_pivot_refund', $1, $2, $3, $4, 'pending', 0, NOW(), NOW())
             RETURNING id`,
            [
              payoutGameId,
              address,
              amount,
              "Refund balance suite au pivot legal F2P (PR #45)",
            ],
          );
          payoutId = insertRes.rows[0].id;
        }

        // Increment attempts.
        await client.query(
          `UPDATE payouts SET attempts = attempts + 1, status='sending', updated_at=NOW() WHERE id=$1`,
          [payoutId],
        );

        // Broadcast on-chain.
        const amountWei = ethers.parseEther(String(amount));
        const txHash = await broadcastTransfer(client, address, amountWei);

        await client.query(
          `UPDATE payouts SET transfer_tx_hash=$1, status='sending', updated_at=NOW() WHERE id=$2`,
          [txHash, payoutId],
        );

        const debitNote = alreadyDebited ? " (ledger deja existant)" : "";
        console.log(`[OK] tx ${txHash}${debitNote}`);
        stats.paid++;
      } catch (err) {
        console.log(`[FAIL] ${err.message ?? err}`);
        stats.failed++;
      }

      if (i < accounts.length - 1 && DELAY_MS > 0) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    console.log("");
    console.log("=".repeat(60));
    console.log("Resume :");
    console.log(`  Payouts en cours/done   : ${stats.paid}`);
    console.log(`  Deja effectue           : ${stats.alreadyDone}`);
    console.log(`  Echecs                  : ${stats.failed}`);
    console.log("=".repeat(60));

    if (stats.failed > 0) {
      console.log("");
      console.log("ATTENTION: Certains refunds ont echoue. Verifier la table `payouts`");
      console.log("           pour les rows status='failed' et re-run le script.");
      console.log("           Le script est idempotent - un re-run ne double-paie pas.");
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[refund-all-balances] Fatal:", err);
  process.exit(1);
});
