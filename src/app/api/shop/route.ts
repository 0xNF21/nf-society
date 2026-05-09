export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { shopItems, shopPurchases, shopCoupons, players } from "@/lib/db/schema";
import { eq, and, gt } from "drizzle-orm";
import { computeLevel } from "@/lib/xp";
import { loadXpConfig } from "@/lib/xp-server";
import { getAuthenticatedAddress } from "@/lib/auth/session";

const HIDDEN_LEGACY_SHOP_SLUGS = new Set(["spin_refund", "spin_week_refund"]);
const normalizeShopItem = <T extends { category: string; description: string }>(item: T): T =>
  item.category === "crc" && item.description.includes("XP")
    ? { ...item, description: item.description.replaceAll("XP", "Fragments") }
    : item;

export async function GET(req: NextRequest) {
  try {
    const requestedAddress = req.nextUrl.searchParams.get("address")?.toLowerCase() ?? null;
    const authenticatedAddress = (await getAuthenticatedAddress(req).catch(() => null))?.toLowerCase() ?? null;
    const { levels } = await loadXpConfig();

    // Fetch all active shop items
    const rawItems = await db
      .select()
      .from(shopItems)
      .where(eq(shopItems.active, true));
    const items = rawItems
      .filter((item) => !HIDDEN_LEGACY_SHOP_SLUGS.has(item.slug))
      .map(normalizeShopItem);

    if (requestedAddress && requestedAddress !== authenticatedAddress) {
      return NextResponse.json(
        {
          error: "AUTH_REQUIRED",
          message: "Shop Fragments balance is only available to the authenticated owner.",
          items,
          player: null,
          fragmentsBalance: 0,
          level: 1,
        },
        { status: 401 },
      );
    }

    const address = requestedAddress ?? authenticatedAddress;
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
        fragmentsBalance: 0,
        level: 1,
      });
    }

    const fragmentsBalance = player.fragmentsBalance;
    const level = computeLevel(player.xp, levels);

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
      const canBuy = fragmentsBalance >= item.fragmentsCost && level >= item.levelRequired;
      const isOwned = item.category === "cosmetic" && ownedCosmetics.some(p => p.itemSlug === item.slug);
      const activeBoost = activePurchases.find(p => p.itemSlug === item.slug);
      const activeCoupon = activeCoupons.find(c => c.type === item.refundType);

      let status: string = "available";
      if (isOwned) status = "owned";
      else if (activeBoost) status = "active";
      else if (activeCoupon) status = "coupon_active";
      else if (level < item.levelRequired) status = "level_required";
      else if (fragmentsBalance < item.fragmentsCost) status = "insufficient_fragments";

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
        fragmentsBalance,
        fragmentsSpent: player.fragmentsSpent,
        level,
      },
      fragmentsBalance,
      level,
    });
  } catch (error) {
    console.error("Shop GET error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
