import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { dailySessions, gameFragmentEvents, payouts, shopItems, shopPurchases } from "@/lib/db/schema";
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { ALL_SERVER_GAMES } from "@/lib/game-registry-server";
import { GAME_LABELS } from "@/lib/game-registry";
import { ALL_CHANCE_SERVER_GAMES } from "@/lib/chance-registry-server";
import { getAuthenticatedAddress } from "@/lib/auth/session";
import { getPrivacyFlags } from "@/lib/privacy";
import { parseDailyWheelResult } from "@/lib/daily";

export const dynamic = "force-dynamic";

type TransactionCurrency = "CRC" | "Fragments";

type Transaction = {
  type: "in" | "out";
  amount: number;
  currency: TransactionCurrency;
  label: string;
  category: string;
  date: string;
};

function isOnchainTx(hash: string | null | undefined): boolean {
  return typeof hash === "string" && hash.startsWith("0x");
}

function gameLabel(gameKey: string | null | undefined): string {
  if (!gameKey) return "Jeu";
  return GAME_LABELS[gameKey] || ALL_CHANCE_SERVER_GAMES.find((g) => g.key === gameKey)?.label || gameKey;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { address: string } }
) {
  const limited = await enforceRateLimit(_req, "players-address-transactions", 30, 60000);
  if (limited) return limited;

  try {
    const addr = params.address.toLowerCase();
    const authenticatedAddress = await getAuthenticatedAddress(_req).catch(() => null);
    const isOwner = authenticatedAddress?.toLowerCase() === addr;
    const privacy = isOwner ? null : await getPrivacyFlags(addr);

    if (privacy?.hideGameHistory) {
      return NextResponse.json({ transactions: [] });
    }

    const transactions: Transaction[] = [];

    // 1. Fragments ledger - source of truth for current F2P game activity.
    const fragmentRows = await db
      .select({
        gameKey: gameFragmentEvents.gameKey,
        gameSlug: gameFragmentEvents.gameSlug,
        eventType: gameFragmentEvents.eventType,
        amountFragments: gameFragmentEvents.amountFragments,
        createdAt: gameFragmentEvents.createdAt,
      })
      .from(gameFragmentEvents)
      .where(
        and(
          sql`LOWER(${gameFragmentEvents.playerAddress}) = ${addr}`,
          inArray(gameFragmentEvents.eventType, ["bet", "win"]),
        ),
      )
      .orderBy(desc(gameFragmentEvents.createdAt));

    for (const row of fragmentRows) {
      const isBet = row.eventType === "bet";
      if (isBet && privacy?.hideTotalBet) continue;
      if (!isBet && privacy?.hidePnl) continue;

      const amount = Number(row.amountFragments || 0);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const label = gameLabel(row.gameKey);
      transactions.push({
        type: isBet ? "out" : "in",
        amount,
        currency: "Fragments",
        label: `${label}${row.gameSlug ? ` ${row.gameSlug}` : ""} - ${isBet ? "mise" : "gain"}`,
        category: row.gameKey,
        date: row.createdAt.toISOString(),
      });
    }

    // 1b. Daily Fragments are credited directly from daily sessions.
    if (!privacy?.hidePnl) {
      const dailyRewardRows = await db
        .select({
          date: dailySessions.date,
          spinResult: dailySessions.spinResult,
          createdAt: dailySessions.createdAt,
        })
        .from(dailySessions)
        .where(
          and(
            eq(dailySessions.address, addr),
            eq(dailySessions.spinPlayed, true),
            sql`${dailySessions.spinResult} IS NOT NULL`,
          ),
        )
        .orderBy(desc(dailySessions.createdAt));

      for (const session of dailyRewardRows) {
        const result = parseDailyWheelResult(session.spinResult);
        const amount = Math.floor(Number(result?.fragmentsValue || 0));
        if (amount <= 0) continue;
        transactions.push({
          type: "in",
          amount,
          currency: "Fragments",
          label: `Daily - ${result?.label || `+${amount} Fragments`}`,
          category: "daily",
          date: session.createdAt.toISOString(),
        });
      }
    }

    // 1c. Shop purchases spend Fragments.
    if (!privacy?.hideFragmentsSpent) {
      const shopRows = await db
        .select({
          itemSlug: shopPurchases.itemSlug,
          fragmentsSpent: shopPurchases.fragmentsSpent,
          createdAt: shopPurchases.createdAt,
          itemName: shopItems.name,
        })
        .from(shopPurchases)
        .leftJoin(shopItems, eq(shopPurchases.itemSlug, shopItems.slug))
        .where(sql`LOWER(${shopPurchases.address}) = ${addr}`)
        .orderBy(desc(shopPurchases.createdAt));

      for (const row of shopRows) {
        const amount = Number(row.fragmentsSpent || 0);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        transactions.push({
          type: "out",
          amount,
          currency: "Fragments",
          label: `Boutique - ${row.itemName || row.itemSlug}`,
          category: "shop",
          date: row.createdAt.toISOString(),
        });
      }
    }

    // 2. Payouts received (real on-chain CRC in, including daily CRC rewards)
    if (!privacy?.hidePnl) {
      const playerPayouts = await db.select({
        amountCrc: payouts.amountCrc,
        gameType: payouts.gameType,
        reason: payouts.reason,
        createdAt: payouts.createdAt,
      }).from(payouts).where(
        and(
          eq(payouts.recipientAddress, addr),
          eq(payouts.status, "success"),
          sql`COALESCE(${payouts.transferTxHash}, '') NOT LIKE 'fragments:%'`,
        )
      ).orderBy(desc(payouts.createdAt));

      for (const p of playerPayouts) {
        transactions.push({
          type: "in",
          amount: Number(p.amountCrc),
          currency: "CRC",
          label: p.reason || `${p.gameType} payout`,
          category: p.gameType,
          date: p.createdAt.toISOString(),
        });
      }
    }

    // 2. Game bets (CRC out) — from each game table
    if (!privacy?.hideTotalBet) {
      for (const config of ALL_SERVER_GAMES) {
      try {
        const games = await db.select({
          slug: config.table.slug,
          betCrc: config.table.betCrc,
          updatedAt: config.table.updatedAt,
          player1Address: config.table.player1Address,
          player2Address: config.table.player2Address,
          player1TxHash: config.table.player1TxHash,
          player2TxHash: config.table.player2TxHash,
          status: config.table.status,
        }).from(config.table).where(
          sql`(${config.table.player1Address} = ${addr} OR ${config.table.player2Address} = ${addr}) AND ${config.table.status} != 'waiting_p1'`
        ).orderBy(desc(config.table.updatedAt));

        for (const g of games) {
          const isP1 = typeof g.player1Address === "string" && g.player1Address.toLowerCase() === addr;
          const txHash = isP1 ? g.player1TxHash : g.player2TxHash;
          if (!isOnchainTx(txHash)) continue;

          transactions.push({
            type: "out",
            amount: g.betCrc,
            currency: "CRC",
            label: `${GAME_LABELS[config.key] || config.key} ${g.slug} — mise`,
            category: config.key,
            date: g.updatedAt.toISOString(),
          });
        }
      } catch {}
      }
    }

    // 3. Chance game bets (CRC out) — blackjack, hilo, mines, dice, coin_flip,
    //    roulette, keno, plinko, crash_dash, lootboxes.
    //    Rounds abandonnees (status="playing") sont exclues via le registre.
    if (!privacy?.hideTotalBet) {
      for (const cfg of ALL_CHANCE_SERVER_GAMES) {
      try {
        const rounds = await cfg.getPlayerRounds(addr);
        for (const r of rounds) {
          if (r.betCrc <= 0) continue;
          if (!isOnchainTx(r.txHash)) continue;
          transactions.push({
            type: "out",
            amount: r.betCrc,
            currency: "CRC",
            label: `${cfg.label} — mise`,
            category: cfg.key,
            date: r.createdAt.toISOString(),
          });
        }
      } catch {}
      }
    }

    // 4. Daily sessions (CRC out — 1 CRC each)
    if (!privacy?.hideTotalBet) {
      try {
      const sessions = await db.select({
        date: dailySessions.date,
        createdAt: dailySessions.createdAt,
      }).from(dailySessions).where(
        and(eq(dailySessions.address, addr), sql`${dailySessions.txHash} LIKE '0x%'`)
      ).orderBy(desc(dailySessions.createdAt));

      for (const s of sessions) {
        transactions.push({
          type: "out",
          amount: 1,
          currency: "CRC",
          label: `Daily — ticket ${s.date}`,
          category: "daily",
          date: s.createdAt.toISOString(),
        });
      }
      } catch {}
    }

    // Sort by date desc
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return NextResponse.json({ transactions: transactions.slice(0, 100) });
  } catch (error) {
    console.error("[Transactions] Error:", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
