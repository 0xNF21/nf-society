/**
 * Smoke test the creditPrize flow to verify the treasury debit mirror.
 *
 * Usage: npx tsx scripts/smoke-credit-prize.ts
 */
import fs from "node:fs";
import path from "node:path";

// Load .env.local into process.env before importing wallet.ts (drizzle reads
// DATABASE_URL at import time).
const envFile = path.resolve(".env.local");
const envText = fs.readFileSync(envFile, "utf8");
for (const line of envText.split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const idx = line.indexOf("=");
  const k = line.slice(0, idx).trim();
  const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
  if (!(k in process.env)) process.env[k] = v;
}

async function main() {
  const { creditPrize, DAO_TREASURY_ADDRESS } = await import("../src/lib/wallet");
  const { db } = await import("../src/lib/db");
  const { players } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const ADDR = "0x158a0ec28264d37b6471736f29e8f68f0c927ed5";
  const ref = {
    gameType: "smoke",
    gameSlug: "test",
    gameRef: `test-${Date.now()}`,
  };
  const amount = 2.5;

  const before = await db.select().from(players).where(eq(players.address, ADDR.toLowerCase())).limit(1);
  const treasuryBefore = await db.select().from(players).where(eq(players.address, DAO_TREASURY_ADDRESS)).limit(1);
  console.log(`[BEFORE] user.balance     = ${before[0]?.balanceCrc ?? "(no row)"}`);
  console.log(`[BEFORE] treasury.balance = ${treasuryBefore[0]?.balanceCrc ?? "(no row)"}`);

  console.log(`\nCalling creditPrize(${ADDR}, ${amount}, ref=${ref.gameRef})...`);
  const result = await creditPrize(ADDR, amount, ref);
  console.log("result:", result);

  const after = await db.select().from(players).where(eq(players.address, ADDR.toLowerCase())).limit(1);
  const treasuryAfter = await db.select().from(players).where(eq(players.address, DAO_TREASURY_ADDRESS)).limit(1);
  console.log(`\n[AFTER ] user.balance     = ${after[0]?.balanceCrc}`);
  console.log(`[AFTER ] treasury.balance = ${treasuryAfter[0]?.balanceCrc}`);
  console.log(`\nExpected deltas: user +${amount}, treasury -${amount}`);
  console.log(`Actual   deltas: user ${(after[0]?.balanceCrc ?? 0) - (before[0]?.balanceCrc ?? 0)}, treasury ${(treasuryAfter[0]?.balanceCrc ?? 0) - (treasuryBefore[0]?.balanceCrc ?? 0)}`);

  console.log("\nSecond call with same ref (should be duplicate_txhash)...");
  const result2 = await creditPrize(ADDR, amount, ref);
  console.log("result2:", result2);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
