// Check divergence between local bot_state.last_nonce and on-chain nonce.
import pg from "pg";
import fs from "node:fs";
import { ethers } from "ethers";

const envFile = process.argv[2] || ".env.local";

const env = Object.fromEntries(
  fs.readFileSync(envFile, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      const k = l.slice(0, i).trim();
      let v = l.slice(i + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return [k, v];
    }),
);

const url = env.DATABASE_URL;
const botKey = env.BOT_PRIVATE_KEY;

const isLocal = url.includes("localhost") || url.includes("127.0.0.1");
const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false } });

const provider = new ethers.JsonRpcProvider("https://rpc.gnosischain.com");
const wallet = new ethers.Wallet(botKey, provider);

const onchainLatest = await provider.getTransactionCount(wallet.address, "latest");
const onchainPending = await provider.getTransactionCount(wallet.address, "pending");

const { rows } = await pool.query(`SELECT last_nonce, updated_at FROM bot_state WHERE id = 1`);
const local = rows[0];

console.log(`Env            : ${envFile}`);
console.log(`Bot wallet     : ${wallet.address}`);
console.log(`On-chain latest: ${onchainLatest}`);
console.log(`On-chain pending: ${onchainPending}`);
console.log(`Local last_nonce: ${local?.last_nonce}  (updated ${local?.updated_at})`);
console.log(`Next reserveNonce() would return: ${(local?.last_nonce ?? -1) + 1}`);
console.log(`Next valid on-chain nonce: ${onchainPending}`);
const delta = onchainPending - ((local?.last_nonce ?? 0) + 1);
console.log(`Delta: ${delta} (negative = local ahead, positive = local behind)`);

await pool.end();
