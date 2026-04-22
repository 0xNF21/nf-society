const { Client } = require('pg');
async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query(
    "INSERT INTO player_badges (address, badge_slug) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    ['0x158a0ec28264d37b6471736f29e8f68f0c927ed5', 'supreme_founder']
  );
  console.log('supreme_founder badge awarded to cryptosnf');
  await c.end();
}
main().catch(e => { console.error(e); process.exit(1); });
