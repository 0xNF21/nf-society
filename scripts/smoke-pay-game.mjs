// Smoke test for POST /api/wallet/pay-game.
// Tests: invalid input, unsupported game, insufficient balance path,
// and a successful chance-round creation with a clean rollback on bad input.
// Requires: dev server running + .env.local + an address with known balance.

const ADDR = (process.argv[2] || "0x158a0ec28264d37b6471736f29e8f68f0c927ed5").toLowerCase();
const TOKEN = "smoke1234";
const BASE = "http://localhost:3000/api/wallet";

async function call(label, body) {
  const res = await fetch(`${BASE}/pay-game`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = text; }
  console.log(`${label}: ${res.status}`);
  console.log("  ", JSON.stringify(payload).slice(0, 220));
  return { status: res.status, payload };
}

// 1) Missing fields
await call("missing fields", {});

// 2) Unsupported game
await call("unsupported game", {
  gameKey: "coin_flip", slug: "classic", address: ADDR, playerToken: TOKEN, amount: 1,
});

// 3) Invalid address
await call("invalid address", {
  gameKey: "roulette", slug: "classic", address: "0x123", playerToken: TOKEN, amount: 1,
});

// 4) Table not found (valid game, bad slug)
await call("table not found (roulette)", {
  gameKey: "roulette", slug: "does-not-exist", address: ADDR, playerToken: TOKEN, amount: 1,
});

// 5) Insufficient balance — bet much higher than current balance
await call("insufficient balance", {
  gameKey: "roulette", slug: "classic", address: ADDR, playerToken: TOKEN, amount: 9999,
});

// 6) Current balance check
const balRes = await fetch(`${BASE}/balance?address=${ADDR}`);
const balData = await balRes.json();
console.log(`\nCurrent balance: ${balData.balanceCrc}`);

// 7) Happy path: roulette with 1 CRC (needs bet in betOptions)
await call("happy roulette 1 CRC", {
  gameKey: "roulette", slug: "classic", address: ADDR, playerToken: TOKEN + "_ok", amount: 1,
});

// 8) Verify balance reduced
const balRes2 = await fetch(`${BASE}/balance?address=${ADDR}`);
const balData2 = await balRes2.json();
console.log(`\nBalance after: ${balData2.balanceCrc} (delta: ${balData2.balanceCrc - balData.balanceCrc})`);
