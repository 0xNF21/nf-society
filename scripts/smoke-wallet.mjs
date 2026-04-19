// Smoke test for Phase 3a wallet routes.
// Requires npm run dev running on http://localhost:3000.

const ADDR = process.argv[2] || "0x158a0ec28264d37b6471736f29e8f68f0c927ed5";
const BASE = "http://localhost:3000/api/wallet";

async function j(label, res) {
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  console.log(`${label}: ${res.status}`);
  console.log("  ", JSON.stringify(body, null, 2).split("\n").join("\n   "));
  return body;
}

console.log(`Address: ${ADDR}\n`);

// 1) GET balance (should be 0 for fresh address)
await j("GET /balance", await fetch(`${BASE}/balance?address=${ADDR}`));

// 2) GET balance without address -> 400
await j("GET /balance (no addr)", await fetch(`${BASE}/balance`));

// 3) POST topup-scan with address
await j(
  "POST /topup-scan { address }",
  await fetch(`${BASE}/topup-scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address: ADDR }),
  }),
);

// 4) GET ledger
await j("GET /ledger", await fetch(`${BASE}/ledger?address=${ADDR}&limit=5`));
