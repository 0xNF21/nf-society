// Smoke test for lottery (via /api/wallet/pay-game) and daily
// (via /api/daily/claim-from-balance).
const ADDR = (process.argv[2] || "0x158a0ec28264d37b6471736f29e8f68f0c927ed5").toLowerCase();
const BASE = "http://localhost:3000/api";

async function call(label, url, body) {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = text; }
  console.log(`${label}: ${res.status}`);
  console.log("  ", JSON.stringify(payload).slice(0, 260));
  return { status: res.status, payload };
}

// 1) Daily from balance — the happy path. Should grant a daily session
//    without any CRC debit.
await call("daily claim-from-balance (no addr)", "/daily/claim-from-balance", {});
await call("daily claim-from-balance (invalid addr)", "/daily/claim-from-balance", { address: "0x123" });
const balBefore = await fetch(`${BASE}/wallet/balance?address=${ADDR}`).then(r => r.json());
console.log(`\nBalance before daily: ${balBefore.balanceCrc}`);

await call("daily claim-from-balance (valid)", "/daily/claim-from-balance", { address: ADDR });
await call("daily claim-from-balance (second call = already claimed)", "/daily/claim-from-balance", { address: ADDR });
const balAfter = await fetch(`${BASE}/wallet/balance?address=${ADDR}`).then(r => r.json());
console.log(`\nBalance after daily: ${balAfter.balanceCrc} (should be unchanged)`);

// 2) Lottery via pay-game — look up any active lottery first.
console.log(`\nLottery: look up active lotteries...`);
const res = await fetch(`${BASE}/lotteries`);
const lotteries = await res.json();
const active = (lotteries?.lotteries || lotteries || []).find?.(l => l.status === "active");
if (!active) {
  console.log("No active lottery found — skipping lottery smoke test.");
  process.exit(0);
}
console.log(`Active lottery: slug=${active.slug}, ticketPriceCrc=${active.ticketPriceCrc}`);

await call("lottery pay-from-balance (valid)", "/wallet/pay-game", {
  gameKey: "lottery",
  slug: active.slug,
  address: ADDR,
  playerToken: "smoke-lottery-test",
  amount: active.ticketPriceCrc,
});

// Re-attempt same lottery → already_joined
await call("lottery pay-from-balance (dup)", "/wallet/pay-game", {
  gameKey: "lottery",
  slug: active.slug,
  address: ADDR,
  playerToken: "smoke-lottery-test-2",
  amount: active.ticketPriceCrc,
});
