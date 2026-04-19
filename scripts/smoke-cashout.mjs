// Smoke test for /api/wallet/cashout-init + /api/wallet/cashout-status.
// Requires dev server running. Doesn't send the 1 CRC proof (that would
// need an on-chain tx) — validates init response + status shape only.
//
// Usage: PORT=3002 node scripts/smoke-cashout.mjs
const PORT = process.env.PORT || "3000";
const BASE = `http://localhost:${PORT}/api/wallet`;

async function post(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = text; }
  return { status: res.status, payload };
}

async function get(url) {
  const res = await fetch(url);
  const text = await res.text();
  let payload;
  try { payload = JSON.parse(text); } catch { payload = text; }
  return { status: res.status, payload };
}

console.log("\n1) Invalid amount (0):");
console.log(await post(`${BASE}/cashout-init`, { amountCrc: 0 }));

console.log("\n2) Below minimum (0.5):");
console.log(await post(`${BASE}/cashout-init`, { amountCrc: 0.5 }));

console.log("\n3) Above maximum (5000):");
console.log(await post(`${BASE}/cashout-init`, { amountCrc: 5000 }));

console.log("\n4) Valid (5 CRC):");
const init = await post(`${BASE}/cashout-init`, { amountCrc: 5 });
console.log({
  status: init.status,
  token: init.payload.token,
  amountCrc: init.payload.amountCrc,
  hasQr: !!init.payload.qrCode,
  paymentLink: init.payload.paymentLink?.slice(0, 80),
  expiresAt: init.payload.expiresAt,
});

if (init.payload.token) {
  console.log("\n5) Status on fresh token (should be 'pending'):");
  console.log(await get(`${BASE}/cashout-status?token=${init.payload.token}`));
}

console.log("\n6) Status on unknown token:");
console.log(await get(`${BASE}/cashout-status?token=FAKE-TOKEN`));
