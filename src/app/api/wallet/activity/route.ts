export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { getLedger } from "@/lib/wallet";
import {
  hiloRounds,
  blackjackHands,
  minesRounds,
  diceRounds,
  rouletteRounds,
  plinkoRounds,
  kenoRounds,
  crashDashRounds,
  coinFlipResults,
  lootboxes,
  lootboxOpens,
  dailySessions,
  morpionGames,
  memoryGames,
  relicsGames,
  damesGames,
  pfcGames,
  crcRacesGames,
  payouts,
} from "@/lib/db/schema";
import { sql, eq, and, inArray } from "drizzle-orm";

type ActivityEntry = {
  id: string;
  address: string;
  kind: string;
  amountCrc: number;
  balanceAfter: number | null;
  reason: string | null;
  txHash: string | null;
  gameType: string | null;
  gameSlug: string | null;
  createdAt: string;
  onchainTxHash: string | null;
};

type ChanceCfg = {
  key: string;
  label: string;
  table: any;
  excludeStatuses: string[];
};

const CHANCE_GAMES: ChanceCfg[] = [
  { key: "hilo", label: "Hi-Lo", table: hiloRounds, excludeStatuses: ["playing"] },
  { key: "blackjack", label: "Blackjack", table: blackjackHands, excludeStatuses: ["playing"] },
  { key: "mines", label: "Mines", table: minesRounds, excludeStatuses: ["playing"] },
  { key: "dice", label: "Dice", table: diceRounds, excludeStatuses: ["playing"] },
  { key: "roulette", label: "Roulette", table: rouletteRounds, excludeStatuses: ["playing"] },
  { key: "plinko", label: "Plinko", table: plinkoRounds, excludeStatuses: ["playing"] },
  { key: "keno", label: "Keno", table: kenoRounds, excludeStatuses: ["playing"] },
  { key: "crash_dash", label: "Crash", table: crashDashRounds, excludeStatuses: ["playing"] },
  { key: "coin_flip", label: "Pile ou Face", table: coinFlipResults, excludeStatuses: [] },
];

const MULTI_GAMES = [
  { key: "morpion", label: "Morpion", table: morpionGames },
  { key: "memory", label: "Memory", table: memoryGames },
  { key: "relics", label: "Relics", table: relicsGames },
  { key: "dames", label: "Dames", table: damesGames },
  { key: "pfc", label: "Pierre-Feuille-Ciseaux", table: pfcGames },
];

const MULTI_GAME_KEYS = [...MULTI_GAMES.map((g) => g.key), "crc_races", "crc-races"];

function toIso(d: any): string {
  if (d instanceof Date) return d.toISOString();
  try {
    return new Date(d).toISOString();
  } catch {
    return String(d);
  }
}

function isOnchain(h: string | null | undefined): boolean {
  return typeof h === "string" && h.startsWith("0x");
}

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "wallet-activity", 30, 60000);
  if (limited) return limited;

  try {
    const address = req.nextUrl.searchParams.get("address");
    if (!address) {
      return NextResponse.json({ error: "address required" }, { status: 400 });
    }
    const addr = address.toLowerCase();
    const limitParam = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(Math.max(parseInt(limitParam || "20", 10) || 20, 1), 100);

    const entries: ActivityEntry[] = [];

    // 1. Wallet ledger — all internal balance movements
    const ledger = await getLedger(address, 100);
    for (const row of ledger) {
      entries.push({
        id: `ledger:${row.id}`,
        address: row.address,
        kind: row.kind,
        amountCrc: Number(row.amountCrc),
        balanceAfter: row.balanceAfter != null ? Number(row.balanceAfter) : null,
        reason: row.reason || null,
        txHash: row.txHash || null,
        gameType: row.gameType || null,
        gameSlug: row.gameSlug || null,
        createdAt: toIso(row.createdAt),
        onchainTxHash: row.onchainTxHash || null,
      });
    }

    // 2. Chance rounds paid on-chain (balance-paid rows are already in ledger)
    for (const cfg of CHANCE_GAMES) {
      const t = cfg.table;
      const conds: any[] = [
        sql`LOWER(${t.playerAddress}) = ${addr}`,
        sql`${t.transactionHash} LIKE '0x%'`,
      ];
      if (cfg.excludeStatuses.length > 0) {
        conds.push(sql`${t.status} NOT IN (${sql.join(cfg.excludeStatuses.map((s) => sql`${s}`), sql`, `)})`);
      }
      const rows = await db
        .select({
          id: t.id,
          betCrc: t.betCrc,
          payoutCrc: t.payoutCrc,
          payoutTxHash: t.payoutTxHash,
          transactionHash: t.transactionHash,
          createdAt: t.createdAt,
        })
        .from(t)
        .where(and(...conds));

      for (const r of rows) {
        const bet = Number(r.betCrc || 0);
        const created = toIso(r.createdAt);
        entries.push({
          id: `chance:${cfg.key}:${r.id}:bet`,
          address: addr,
          kind: "game-bet",
          amountCrc: -bet,
          balanceAfter: null,
          reason: `${cfg.label} — mise`,
          txHash: r.transactionHash || null,
          gameType: cfg.key,
          gameSlug: null,
          createdAt: created,
          onchainTxHash: isOnchain(r.transactionHash) ? r.transactionHash : null,
        });

        const prize = Number(r.payoutCrc || 0);
        const prizeHash = r.payoutTxHash || null;
        const prizeOnBalance = typeof prizeHash === "string" && prizeHash.startsWith("balance-credit:");
        if (prize > 0 && !prizeOnBalance) {
          entries.push({
            id: `chance:${cfg.key}:${r.id}:prize`,
            address: addr,
            kind: "game-prize",
            amountCrc: prize,
            balanceAfter: null,
            reason: `${cfg.label} — gain`,
            txHash: prizeHash,
            gameType: cfg.key,
            gameSlug: null,
            createdAt: created,
            onchainTxHash: isOnchain(prizeHash) ? prizeHash : null,
          });
        }
      }
    }

    // 3. Lootbox opens paid on-chain
    {
      const rows = await db
        .select({
          id: lootboxOpens.id,
          rewardCrc: lootboxOpens.rewardCrc,
          transactionHash: lootboxOpens.transactionHash,
          payoutTxHash: lootboxOpens.payoutTxHash,
          openedAt: lootboxOpens.openedAt,
          pricePerOpenCrc: lootboxes.pricePerOpenCrc,
          lootboxTitle: lootboxes.title,
        })
        .from(lootboxOpens)
        .innerJoin(lootboxes, eq(lootboxOpens.lootboxId, lootboxes.id))
        .where(
          and(
            sql`LOWER(${lootboxOpens.playerAddress}) = ${addr}`,
            sql`${lootboxOpens.transactionHash} LIKE '0x%'`,
          ),
        );
      for (const r of rows) {
        const created = toIso(r.openedAt);
        const title = r.lootboxTitle || "Lootbox";
        entries.push({
          id: `chance:lootbox:${r.id}:bet`,
          address: addr,
          kind: "game-bet",
          amountCrc: -Number(r.pricePerOpenCrc || 0),
          balanceAfter: null,
          reason: `${title} — ouverture`,
          txHash: r.transactionHash || null,
          gameType: "lootbox",
          gameSlug: null,
          createdAt: created,
          onchainTxHash: isOnchain(r.transactionHash) ? r.transactionHash : null,
        });
        const reward = Number(r.rewardCrc || 0);
        const prizeHash = r.payoutTxHash || null;
        const onBal = typeof prizeHash === "string" && prizeHash.startsWith("balance-credit:");
        if (reward > 0 && !onBal) {
          entries.push({
            id: `chance:lootbox:${r.id}:prize`,
            address: addr,
            kind: "game-prize",
            amountCrc: reward,
            balanceAfter: null,
            reason: `${title} — recompense`,
            txHash: prizeHash,
            gameType: "lootbox",
            gameSlug: null,
            createdAt: created,
            onchainTxHash: isOnchain(prizeHash) ? prizeHash : null,
          });
        }
      }
    }

    // 4. Multiplayer games — bets paid on-chain (per player slot)
    for (const cfg of MULTI_GAMES) {
      const t = cfg.table;
      const rows = await db
        .select({
          slug: t.slug,
          betCrc: t.betCrc,
          player1Address: t.player1Address,
          player2Address: t.player2Address,
          player1TxHash: t.player1TxHash,
          player2TxHash: t.player2TxHash,
          updatedAt: t.updatedAt,
          status: t.status,
        })
        .from(t)
        .where(
          sql`(LOWER(${t.player1Address}) = ${addr} OR LOWER(${t.player2Address}) = ${addr})`,
        );

      for (const g of rows) {
        const isP1 =
          typeof g.player1Address === "string" && g.player1Address.toLowerCase() === addr;
        const tx = isP1 ? g.player1TxHash : g.player2TxHash;
        if (!isOnchain(tx)) continue;
        entries.push({
          id: `multi:${cfg.key}:${g.slug}:${isP1 ? "p1" : "p2"}:bet`,
          address: addr,
          kind: "game-bet",
          amountCrc: -Number(g.betCrc || 0),
          balanceAfter: null,
          reason: `${cfg.label} ${g.slug} — mise`,
          txHash: tx,
          gameType: cfg.key,
          gameSlug: g.slug,
          createdAt: toIso(g.updatedAt),
          onchainTxHash: tx as string,
        });
      }
    }

    // 4b. crc_races — payment = player entry in jsonb players array, not a per-slot tx_hash
    //     Only include if the player's row carries a real on-chain tx.
    {
      const rows = await db
        .select({
          id: crcRacesGames.id,
          slug: crcRacesGames.slug,
          betCrc: crcRacesGames.betCrc,
          players: crcRacesGames.players,
          updatedAt: crcRacesGames.updatedAt,
        })
        .from(crcRacesGames);
      for (const g of rows) {
        const pls = (g.players as any[]) || [];
        const mine = pls.find(
          (p) => typeof p?.address === "string" && p.address.toLowerCase() === addr,
        );
        if (!mine) continue;
        const tx = typeof mine.txHash === "string" ? mine.txHash : null;
        if (!isOnchain(tx)) continue;
        entries.push({
          id: `multi:crc_races:${g.slug}:bet`,
          address: addr,
          kind: "game-bet",
          amountCrc: -Number(g.betCrc || 0),
          balanceAfter: null,
          reason: `CRC Races ${g.slug} — mise`,
          txHash: tx,
          gameType: "crc_races",
          gameSlug: g.slug,
          createdAt: toIso(g.updatedAt),
          onchainTxHash: tx as string,
        });
      }
    }

    // 5. Multiplayer payouts paid on-chain (chance prizes already covered above)
    const multiPayoutRows = await db
      .select({
        id: payouts.id,
        gameType: payouts.gameType,
        gameId: payouts.gameId,
        amountCrc: payouts.amountCrc,
        transferTxHash: payouts.transferTxHash,
        reason: payouts.reason,
        createdAt: payouts.createdAt,
      })
      .from(payouts)
      .where(
        and(
          sql`LOWER(${payouts.recipientAddress}) = ${addr}`,
          eq(payouts.status, "success"),
          sql`${payouts.transferTxHash} LIKE '0x%'`,
          inArray(payouts.gameType, MULTI_GAME_KEYS),
        ),
      );
    for (const p of multiPayoutRows) {
      entries.push({
        id: `payout:${p.id}`,
        address: addr,
        kind: "game-prize",
        amountCrc: Number(p.amountCrc),
        balanceAfter: null,
        reason: p.reason || `${p.gameType} — gain`,
        txHash: p.transferTxHash || null,
        gameType: p.gameType,
        gameSlug: p.gameId,
        createdAt: toIso(p.createdAt),
        onchainTxHash: p.transferTxHash || null,
      });
    }

    // 6. Daily tickets paid on-chain (1 CRC each)
    const dailyRows = await db
      .select({
        id: dailySessions.id,
        date: dailySessions.date,
        txHash: dailySessions.txHash,
        createdAt: dailySessions.createdAt,
      })
      .from(dailySessions)
      .where(
        and(
          sql`LOWER(${dailySessions.address}) = ${addr}`,
          sql`${dailySessions.txHash} LIKE '0x%'`,
        ),
      );
    for (const s of dailyRows) {
      entries.push({
        id: `daily:${s.id}`,
        address: addr,
        kind: "daily-ticket",
        amountCrc: -1,
        balanceAfter: null,
        reason: `Daily — ticket ${s.date}`,
        txHash: s.txHash || null,
        gameType: "daily",
        gameSlug: s.date,
        createdAt: toIso(s.createdAt),
        onchainTxHash: s.txHash || null,
      });
    }

    entries.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return NextResponse.json({ entries: entries.slice(0, limit) });
  } catch (error: any) {
    console.error("[Wallet] activity error:", error.message);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
