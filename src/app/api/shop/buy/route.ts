import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { shopItems, shopPurchases, shopCoupons, players } from "@/lib/db/schema";
import { eq, and, sql, gt } from "drizzle-orm";
import { getAvailableXp, computeLevel } from "@/lib/xp";
import { executePayout } from "@/lib/payout";

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "shop-buy", 10, 60000);
  if (limited) return limited;

  try {
    const { address, item_slug } = await req.json();

    if (!address || !item_slug) {
      return NextResponse.json({ error: "address and item_slug required" }, { status: 400 });
    }

    const addr = address.toLowerCase();

    // Fetch item
    const [item] = await db
      .select()
      .from(shopItems)
      .where(and(eq(shopItems.slug, item_slug), eq(shopItems.active, true)))
      .limit(1);

    if (!item) {
      return NextResponse.json({ error: "Article introuvable" }, { status: 404 });
    }

    // Fetch player
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.address, addr))
      .limit(1);

    if (!player) {
      return NextResponse.json({ error: "Joueur introuvable" }, { status: 404 });
    }

    // Check XP
    const availableXp = getAvailableXp(player.xp, player.xpSpent);
    if (availableXp < item.xpCost) {
      return NextResponse.json({ error: "XP insuffisant", availableXp, cost: item.xpCost }, { status: 400 });
    }

    // Check level
    const level = computeLevel(player.xp);
    if (level < item.levelRequired) {
      return NextResponse.json({ error: "Niveau insuffisant", level, required: item.levelRequired }, { status: 400 });
    }

    // Check stock
    if (item.stock !== null && item.stock <= 0) {
      return NextResponse.json({ error: "Rupture de stock" }, { status: 400 });
    }

    // Anti double-achat for cosmetics
    if (item.category === "cosmetic") {
      const [existing] = await db
        .select()
        .from(shopPurchases)
        .where(and(eq(shopPurchases.address, addr), eq(shopPurchases.itemSlug, item.slug)))
        .limit(1);
      if (existing) {
        return NextResponse.json({ error: "Article déjà possédé" }, { status: 400 });
      }
    }

    // Limit active coupons (max 5 per type)
    if (item.refundType) {
      const activeCoupons = await db
        .select()
        .from(shopCoupons)
        .where(
          and(
            eq(shopCoupons.address, addr),
            eq(shopCoupons.type, item.refundType),
            eq(shopCoupons.used, false),
            gt(shopCoupons.expiresAt, new Date())
          )
        );
      if (activeCoupons.length >= 5) {
        return NextResponse.json({ error: "Trop de coupons actifs (max 5)" }, { status: 400 });
      }
    }

    // ─── Execute purchase ───

    // 1. Increment xp_spent
    await db
      .update(players)
      .set({ xpSpent: sql`${players.xpSpent} + ${item.xpCost}` })
      .where(eq(players.address, addr));

    // 2. Decrement stock if applicable
    if (item.stock !== null) {
      await db
        .update(shopItems)
        .set({ stock: sql`${shopItems.stock} - 1` })
        .where(eq(shopItems.slug, item.slug));
    }

    // 3. Compute expires_at for time-limited items
    let expiresAt: Date | null = null;
    if (item.slug === "xp_boost_24h") {
      expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    } else if (item.slug === "xp_boost_7d" || item.slug === "commission_reduction_7d" || item.slug === "vip_access_7d") {
      expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    } else if (item.slug === "commission_reduction_30d" || item.slug === "vip_access_30d") {
      expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    // 4. Insert purchase
    await db.insert(shopPurchases).values({
      address: addr,
      itemSlug: item.slug,
      xpSpent: item.xpCost,
      expiresAt,
    });

    // 5. Handle refund coupons (game category)
    let coupon = null;
    if (item.refundType) {
      const couponCount = item.slug === "spin_week_refund" ? 7 : 1;
      const couponExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      for (let i = 0; i < couponCount; i++) {
        const [created] = await db.insert(shopCoupons).values({
          address: addr,
          type: item.refundType,
          expiresAt: couponExpiry,
        }).returning();
        if (i === 0) coupon = created;
      }
    }

    // 6. Handle CRC direct payout
    let payoutResult = null;
    if (item.category === "crc") {
      const crcAmount = parseInt(item.slug.replace("crc_", ""), 10);
      if (crcAmount > 0) {
        payoutResult = await executePayout({
          gameType: "shop_crc",
          gameId: `shop-crc-${addr}-${Date.now()}`,
          recipientAddress: addr,
          amountCrc: crcAmount,
          reason: `Boutique XP — ${item.name}`,
        });
      }
    }

    const newAvailableXp = getAvailableXp(player.xp, player.xpSpent + item.xpCost);

    return NextResponse.json({
      success: true,
      item: { slug: item.slug, name: item.name, category: item.category },
      xpSpent: item.xpCost,
      xpRemaining: newAvailableXp,
      coupon: coupon ? { id: coupon.id, type: coupon.type, expiresAt: coupon.expiresAt } : null,
      payout: payoutResult,
    });
  } catch (error) {
    console.error("Shop buy error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
