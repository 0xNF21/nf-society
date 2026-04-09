export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shopPurchases, shopCoupons, shopItems } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const address = req.nextUrl.searchParams.get("address")?.toLowerCase();
    if (!address) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }

    // Active coupons (unused + not expired)
    const coupons = await db
      .select()
      .from(shopCoupons)
      .where(
        and(
          eq(shopCoupons.address, address),
          eq(shopCoupons.used, false),
          gt(shopCoupons.expiresAt, new Date())
        )
      );

    // Active boosts (not expired)
    const activeBoosts = await db
      .select({
        id: shopPurchases.id,
        itemSlug: shopPurchases.itemSlug,
        expiresAt: shopPurchases.expiresAt,
        createdAt: shopPurchases.createdAt,
      })
      .from(shopPurchases)
      .where(
        and(
          eq(shopPurchases.address, address),
          gt(shopPurchases.expiresAt, new Date())
        )
      );

    // Owned cosmetics (permanent, no expiry)
    const allPurchases = await db
      .select({
        itemSlug: shopPurchases.itemSlug,
        createdAt: shopPurchases.createdAt,
      })
      .from(shopPurchases)
      .where(eq(shopPurchases.address, address));

    // Get cosmetic slugs from shop_items
    const cosmeticItems = await db
      .select({ slug: shopItems.slug })
      .from(shopItems)
      .where(eq(shopItems.category, "cosmetic"));

    const cosmeticSlugs = new Set(cosmeticItems.map(i => i.slug));
    const ownedCosmetics = allPurchases.filter(p => cosmeticSlugs.has(p.itemSlug));

    // Purchase history
    const history = await db
      .select()
      .from(shopPurchases)
      .where(eq(shopPurchases.address, address));

    return NextResponse.json({
      coupons,
      activeBoosts,
      ownedCosmetics,
      history,
    });
  } catch (error) {
    console.error("Shop inventory error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
