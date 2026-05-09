import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { shopItems, shopPurchases, shopCoupons, players } from "@/lib/db/schema";
import { eq, and, sql, gt } from "drizzle-orm";
import { computeLevel } from "@/lib/xp";
import { loadXpConfig } from "@/lib/xp-server";
import { executePayout } from "@/lib/payout";
import { isF2POnlyMode } from "@/lib/legal-mode";
import { requireAuthenticatedAddress } from "@/lib/auth/session";

const HIDDEN_LEGACY_SHOP_SLUGS = new Set(["spin_refund", "spin_week_refund"]);

class ShopPurchaseAbort extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(String(body.error ?? "shop_purchase_aborted"));
  }
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "shop-buy", 10, 60000);
  if (limited) return limited;

  const addressOr401 = await requireAuthenticatedAddress(req);
  if (addressOr401 instanceof NextResponse) return addressOr401;
  const addr = addressOr401;

  try {
    const { item_slug } = await req.json();
    const { levels } = await loadXpConfig();

    if (!item_slug) {
      return NextResponse.json({ error: "item_slug required" }, { status: 400 });
    }

    if (HIDDEN_LEGACY_SHOP_SLUGS.has(item_slug)) {
      return NextResponse.json(
        {
          error: "LEGACY_DAILY_ITEM_DISABLED",
          message: "This daily refund item is no longer available.",
        },
        { status: 410 },
      );
    }

    const [item] = await db
      .select()
      .from(shopItems)
      .where(and(eq(shopItems.slug, item_slug), eq(shopItems.active, true)))
      .limit(1);

    if (!item) {
      return NextResponse.json({ error: "Article introuvable" }, { status: 404 });
    }

    if (item.category === "crc" && isF2POnlyMode()) {
      return NextResponse.json(
        {
          error: "FRAGMENTS_TO_CRC_DISABLED",
          message: "CRC purchases via Fragments are disabled. The shop offers cosmetics and badges only.",
        },
        { status: 410 },
      );
    }

    const purchase = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`shop-buy:${addr}`})::bigint)`);

      const [player] = await tx
        .select()
        .from(players)
        .where(eq(players.address, addr))
        .limit(1);

      if (!player) {
        return { ok: false as const, status: 404, body: { error: "Joueur introuvable" } };
      }

      const fragmentsBalance = player.fragmentsBalance;
      if (fragmentsBalance < item.fragmentsCost) {
        return {
          ok: false as const,
          status: 400,
          body: { error: "Fragments insuffisants", fragmentsBalance, cost: item.fragmentsCost },
        };
      }

      const level = computeLevel(player.xp, levels);
      if (level < item.levelRequired) {
        return {
          ok: false as const,
          status: 400,
          body: { error: "Niveau insuffisant", level, required: item.levelRequired },
        };
      }

      if (item.category === "cosmetic") {
        const [existing] = await tx
          .select({ id: shopPurchases.id })
          .from(shopPurchases)
          .where(and(eq(shopPurchases.address, addr), eq(shopPurchases.itemSlug, item.slug)))
          .limit(1);
        if (existing) {
          return { ok: false as const, status: 400, body: { error: "Article deja possede" } };
        }
      }

      if (item.refundType) {
        const activeCoupons = await tx
          .select({ id: shopCoupons.id })
          .from(shopCoupons)
          .where(
            and(
              eq(shopCoupons.address, addr),
              eq(shopCoupons.type, item.refundType),
              eq(shopCoupons.used, false),
              gt(shopCoupons.expiresAt, new Date()),
            ),
          );
        if (activeCoupons.length >= 5) {
          return { ok: false as const, status: 400, body: { error: "Trop de coupons actifs (max 5)" } };
        }
      }

      const spend = await tx.execute<{ fragmentsBalance: number }>(
        sql`UPDATE players
            SET fragments_balance = fragments_balance - ${item.fragmentsCost},
                fragments_spent = fragments_spent + ${item.fragmentsCost}
            WHERE address = ${addr}
              AND fragments_balance >= ${item.fragmentsCost}
            RETURNING fragments_balance AS "fragmentsBalance"`,
      );
      const spendRow = (spend as any).rows?.[0] ?? (spend as any)[0];
      if (!spendRow) {
        return {
          ok: false as const,
          status: 400,
          body: { error: "Fragments insuffisants", fragmentsBalance, cost: item.fragmentsCost },
        };
      }

      if (item.stock !== null) {
        const stockUpdate = await tx
          .update(shopItems)
          .set({ stock: sql`${shopItems.stock} - 1` })
          .where(and(eq(shopItems.slug, item.slug), gt(shopItems.stock, 0)))
          .returning({ stock: shopItems.stock });
        if (stockUpdate.length === 0) {
          throw new ShopPurchaseAbort(400, { error: "Rupture de stock" });
        }
      }

      let expiresAt: Date | null = null;
      if (item.slug === "xp_boost_24h") {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      } else if (item.slug === "xp_boost_7d" || item.slug === "commission_reduction_7d" || item.slug === "vip_access_7d") {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      } else if (item.slug === "commission_reduction_30d" || item.slug === "vip_access_30d") {
        expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }

      await tx.insert(shopPurchases).values({
        address: addr,
        itemSlug: item.slug,
        fragmentsSpent: item.fragmentsCost,
        expiresAt,
      });

      let coupon = null;
      if (item.refundType) {
        const couponExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        for (let i = 0; i < 1; i++) {
          const [created] = await tx.insert(shopCoupons).values({
            address: addr,
            type: item.refundType,
            expiresAt: couponExpiry,
          }).returning();
          if (i === 0) coupon = created;
        }
      }

      const nextFragmentsBalance = Number(spendRow.fragmentsBalance);
      return {
        ok: true as const,
        coupon,
        newFragmentsBalance: Number.isFinite(nextFragmentsBalance)
          ? nextFragmentsBalance
          : Math.max(0, player.fragmentsBalance - item.fragmentsCost),
      };
    });

    if (!purchase.ok) {
      return NextResponse.json(purchase.body, { status: purchase.status });
    }

    let payoutResult = null;
    if (item.category === "crc") {
      const crcAmount = parseInt(item.slug.replace("crc_", ""), 10);
      if (crcAmount > 0) {
        payoutResult = await executePayout({
          gameType: "shop_crc",
          gameId: `shop-crc-${addr}-${Date.now()}`,
          recipientAddress: addr,
          amountCrc: crcAmount,
          reason: `Boutique Fragments - ${item.name}`,
        });
      }
    }

    return NextResponse.json({
      success: true,
      item: { slug: item.slug, name: item.name, category: item.category },
      fragmentsSpent: item.fragmentsCost,
      fragmentsRemaining: purchase.newFragmentsBalance,
      coupon: purchase.coupon ? { id: purchase.coupon.id, type: purchase.coupon.type, expiresAt: purchase.coupon.expiresAt } : null,
      payout: payoutResult,
    });
  } catch (error) {
    if (error instanceof ShopPurchaseAbort) {
      return NextResponse.json(error.body, { status: error.status });
    }
    console.error("Shop buy error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
