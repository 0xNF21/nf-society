import { db } from "../src/lib/db";
import { shopItems } from "../src/lib/db/schema";

const items = [
  { slug: "lootbox_refund", name: "Lootbox Remboursee", description: "Paie 10 CRC, rembourse automatiquement", icon: "gift", category: "game", xpCost: 500, levelRequired: 1, refundType: "lootbox_refund", refundAmountCrc: 10 },
  { slug: "lootbox_rare_refund", name: "Lootbox Rare Remboursee", description: "Paie 10 CRC, rembourse + Rare garanti", icon: "diamond", category: "game", xpCost: 2000, levelRequired: 4, refundType: "lootbox_rare_refund", refundAmountCrc: 10 },
  { slug: "spin_refund", name: "Daily Spin Rembourse", description: "Paie 1 CRC daily, rembourse automatiquement", icon: "slot", category: "game", xpCost: 200, levelRequired: 1, refundType: "spin_refund", refundAmountCrc: 1 },
  { slug: "spin_week_refund", name: "Pack Spins Semaine", description: "7 daily rembourses sur 7 jours", icon: "package", category: "game", xpCost: 1000, levelRequired: 3, refundType: "spin_refund", refundAmountCrc: 1 },
  { slug: "xp_boost_24h", name: "Boost XP 24h", description: "XP x2 pendant 24h", icon: "zap", category: "boost", xpCost: 300, levelRequired: 2 },
  { slug: "xp_boost_7d", name: "Boost XP 7 jours", description: "XP x1.5 pendant 7 jours", icon: "battery", category: "boost", xpCost: 1500, levelRequired: 4 },
  { slug: "commission_reduction_7d", name: "Commission -2%", description: "Commission reduite de 2% pendant 7 jours", icon: "trending-down", category: "boost", xpCost: 800, levelRequired: 3 },
  { slug: "commission_reduction_30d", name: "Commission -3%", description: "Commission reduite de 3% pendant 30 jours", icon: "bar-chart", category: "boost", xpCost: 2500, levelRequired: 6 },
  { slug: "vip_access_7d", name: "Acces VIP 7 jours", description: "Tables VIP + tournois exclusifs", icon: "crown", category: "boost", xpCost: 3000, levelRequired: 5 },
  { slug: "vip_access_30d", name: "Acces VIP 30 jours", description: "Tables VIP + tournois exclusifs", icon: "trophy", category: "boost", xpCost: 8000, levelRequired: 7 },
  { slug: "streak_shield", name: "Bouclier de Streak", description: "Protege ton streak une fois", icon: "shield", category: "protection", xpCost: 400, levelRequired: 2 },
  { slug: "streak_shield_3", name: "Pack Boucliers x3", description: "Protege ton streak 3 fois", icon: "shield", category: "protection", xpCost: 1000, levelRequired: 3 },
  { slug: "badge_silver", name: "Badge Argent", description: "Badge argente sur ton profil", icon: "award-silver", category: "cosmetic", xpCost: 500, levelRequired: 2 },
  { slug: "badge_gold", name: "Badge Or", description: "Badge dore sur ton profil", icon: "award-gold", category: "cosmetic", xpCost: 2000, levelRequired: 5 },
  { slug: "badge_diamond", name: "Badge Diamant", description: "Badge diamant exclusif", icon: "award-diamond", category: "cosmetic", xpCost: 5000, levelRequired: 8 },
  { slug: "custom_title", name: "Titre Personnalise", description: "Choisis ton propre titre affiche", icon: "edit", category: "cosmetic", xpCost: 3000, levelRequired: 6 },
  { slug: "hall_of_fame", name: "Hall of Fame", description: "Ton nom grave pour toujours", icon: "landmark", category: "cosmetic", xpCost: 10000, levelRequired: 9 },
  { slug: "crc_1", name: "1 CRC", description: "Echange XP contre CRC", icon: "coin", category: "crc", xpCost: 150, levelRequired: 1 },
  { slug: "crc_5", name: "5 CRC", description: "Echange XP contre CRC", icon: "coins", category: "crc", xpCost: 650, levelRequired: 3 },
  { slug: "crc_10", name: "10 CRC", description: "Echange XP contre CRC", icon: "gem", category: "crc", xpCost: 1200, levelRequired: 5 },
  { slug: "crc_25", name: "25 CRC", description: "Echange XP contre CRC", icon: "crown", category: "crc", xpCost: 2800, levelRequired: 7 },
];

async function seed() {
  for (const item of items) {
    await db.insert(shopItems).values(item).onConflictDoNothing();
  }
  console.log(`Seeded ${items.length} shop items`);
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
