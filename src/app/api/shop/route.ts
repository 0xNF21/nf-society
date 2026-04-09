export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shopItems, shopPurchases, shopCoupons, players } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { getAvailableXp, computeLevel } from "@/lib/xp";

export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address")?.toLowerCase();

    // Fetch all active shop items
    const items = await db
      .select()
      .from(shopItems)
      .where(eq(shopItems.active, true));

    if (!address) {
      return NextResponse.json({ items });
    }

    // Fetch player data
    const [player] = await db
      .select()
      .from(players)
      .where(eq(players.address, address))
      .limit(1);

    if (!player) {
      return NextResponse.json({
        items,
        player: null,
        availableXp: 0,
        level: 1,
      });
    }

    const availableXp = getAvailableXp(player.xp, player.xpSpent);
    const level = computeLevel(player.xp);

    // Fetch active purchases (for boost status)
    const activePurchases = await db
      .select()
      .from(shopPurchases)
      .where(
        and(
          eq(shopPurchases.address, address),
          gt(shopPurchases.expiresAt, new Date())
        )
      );

    // Fetch active coupons
    const activeCoupons = await db
      .select()
      .from(shopCoupons)
      .where(
        and(
          eq(shopCoupons.address, address),
          eq(shopCoupons.used, false),
          gt(shopCoupons.expiresAt, new Date())
        )
      );

    // Fetch owned cosmetics (no expiry)
    const ownedCosmetics = await db
      .select()
      .from(shopPurchases)
      .where(
        and(
          eq(shopPurchases.address, address),
        )
      );

    // Build item availability map
    const itemsWithStatus = items.map((item) => {
      const canBuy = availableXp >= item.xpCost && level >= item.levelRequired;
      const isOwned = item.category === "cosmetic" && ownedCosmetics.some(p => p.itemSlug === item.slug);
      const activeBoost = activePurchases.find(p => p.itemSlug === item.slug);
      const activeCoupon = activeCoupons.find(c => c.type === item.refundType);

      let status: string = "available";
      if (isOwned) status = "owned";
      else if (activeBoost) status = "active";
      else if (activeCoupon) status = "coupon_active";
      else if (level < item.levelRequired) status = "level_required";
      else if (availableXp < item.xpCost) status = "insufficient_xp";

      return {
        ...item,
        status,
        activeUntil: activeBoost?.expiresAt ?? null,
      };
    });

    return NextResponse.json({
      items: itemsWithStatus,
      player: {
        address: player.address,
        xp: player.xp,
        xpSpent: player.xpSpent,
        level,
      },
      availableXp,
      level,
    });
  } catch (error) {
    console.error("Shop GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
