const { Client } = require('pg');

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();

  const badges = [
    // Game
    ['first_lootbox', 'Premier Coffre', 'Ouvre ta première lootbox', '🎰', 'emoji', 'game', false],
    ['first_win', 'Première Victoire', 'Gagne ton premier morpion', '🏆', 'emoji', 'game', false],
    ['first_jackpot', 'Jackpot !', 'Obtiens un jackpot', '💎', 'emoji', 'game', false],
    ['lucky_rare', 'Coup de Chance', 'Obtiens un Rare ou mieux', '⭐', 'emoji', 'game', false],
    ['high_roller', 'High Roller', 'Ouvre 50 lootbox', '🎲', 'emoji', 'game', false],
    ['unstoppable', 'Inarrêtable', "Gagne 5 morpions d'affilée", '⚡', 'emoji', 'game', false],
    // Activity
    ['streak_3', 'Régulier', '3 jours de streak', '🔥', 'emoji', 'activity', false],
    ['streak_7', 'Assidu', '7 jours de streak', '🔥🔥', 'emoji', 'activity', false],
    ['streak_30', 'Dédié', '30 jours de streak', '🔥🔥🔥', 'emoji', 'activity', false],
    ['early_bird', 'Lève-tôt', 'Connecté avant 8h', '🌅', 'emoji', 'activity', false],
    ['night_owl', 'Night Owl', 'Joue entre minuit et 4h', '🌙', 'emoji', 'activity', false],
    // Event
    ['founder', 'Fondateur', 'Parmi les 100 premiers', '👑', 'emoji', 'event', false],
    ['early_adopter', 'Early Adopter', 'Parmi les 500 premiers', '🚀', 'emoji', 'event', false],
    ['supreme_founder', 'Fondateur Suprême', 'Créateur de NF Society', '👑✨', 'emoji', 'event', true],
    // Secret
    ['die_hard', '???', '???', '💀', 'emoji', 'secret', true],
    ['ghost', '???', '???', '👻', 'emoji', 'secret', true],
    ['the_one', '???', '???', '🔮', 'emoji', 'secret', true],
  ];

  for (const [slug, name, desc, icon, iconType, category, secret] of badges) {
    await c.query(
      `INSERT INTO badges (slug, name, description, icon, icon_type, category, secret)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (slug) DO UPDATE SET name=$2, description=$3, icon=$4, icon_type=$5, category=$6, secret=$7`,
      [slug, name, desc, icon, iconType, category, secret]
    );
  }

  console.log(`Seeded ${badges.length} badges`);
  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
