/**
 * Equivalent de `payGameFromBalance` en mode Free-to-Play.
 *
 * Au lieu de debiter `players.balance_crc` (CRC reel en depot sur la Safe),
 * on debite `players.xp` (XP virtuels accumules en jouant). Tous les autres
 * garde-fous sont reproduits :
 *
 *  - UPDATE atomique WHERE xp >= amount (PG serialize par row → pas d'overdraft).
 *  - Insert dans `game_xp_events` (type='bet') pour le journal/stats.
 *  - Dispatch via les helpers existants (`assignMultiPlayer`,
 *    `assignCrcRacesPlayer`, `createChanceRound`) — les tables de jeux existantes
 *    stockent la mise dans `betCrc` (unite generique : CRC si mode reel, XP en F2P).
 *  - Si game-side write fail → throw → rollback complet (debit + ledger event).
 *  - Instant-resolve (coin_flip, lootbox) : prize XP credite atomiquement,
 *    commission 5% → `dao_xp_pool`.
 *  - Chance perdu : tout le bet → `dao_xp_pool`.
 *
 * Pas de scan blockchain — donc pas de refund a posteriori : les edge cases
 * (partie pleine, double-paiement, mauvais montant) sont rejetes en amont
 * via les validations de `assignMultiPlayer` / `createChanceRound`, et le
 * rollback PG annule automatiquement le debit si le game-side refuse.
 */

import { db } from "@/lib/db";
import { players, gameXpEvents, daoXpPool } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import {
  assignMultiPlayer,
  assignCrcRacesPlayer,
  createChanceRound,
  MULTI_BALANCE_SUPPORTED,
  CHANCE_BALANCE_SUPPORTED,
  INSTANT_RESOLVE_GAMES,
} from "@/lib/wallet-game-dispatch";

export type PayGameFromXpParams = {
  address: string;
  gameKey: string;
  slug: string;
  amount: number;      // XP (pas CRC) — equivalent de la mise
  playerToken: string;
  extras?: {
    ballValue?: number;
    mineCount?: number;
    pickCount?: number;
    choice?: "heads" | "tails";
  };
};

export type PayGameFromXpResult =
  | {
      ok: true;
      xpAfter: number;                    // solde XP du joueur apres debit (+ eventuel gain instant-resolve)
      family: "multi" | "chance";
      role?: "player1" | "player2" | "racer";
      gameRow?: any;
      roundId?: number;
      tableId?: number;
      prizeXp?: number;                   // pour instant-resolve — gain brut (avant commission)
    }
  | {
      ok: false;
      error:
        | "invalid_address"
        | "invalid_amount"
        | "missing_player_token"
        | "unsupported_game"
        | "insufficient_xp"
        | "not_found"
        | "wrong_bet"
        | "already_joined"
        | "already_full"
        | "invalid_state"
        | "invalid_param"
        | "table_not_found"
        | "internal_error";
    };

/** Commission maison appliquee sur les pots XP, en pourcentage. */
const HOUSE_COMMISSION_PCT = 5;

export async function payGameFromXp(params: PayGameFromXpParams): Promise<PayGameFromXpResult> {
  const addr = params.address.trim().toLowerCase();
  if (!addr || !/^0x[a-f0-9]{40}$/.test(addr)) {
    return { ok: false, error: "invalid_address" };
  }
  if (!params.amount || params.amount <= 0 || !Number.isFinite(params.amount)) {
    return { ok: false, error: "invalid_amount" };
  }
  if (!params.playerToken) {
    return { ok: false, error: "missing_player_token" };
  }

  const isMulti = MULTI_BALANCE_SUPPORTED.has(params.gameKey);
  const isChance = CHANCE_BALANCE_SUPPORTED.has(params.gameKey);
  if (!isMulti && !isChance) {
    return { ok: false, error: "unsupported_game" };
  }

  const amount = Math.round(params.amount);

  try {
    return await db.transaction(async (tx) => {
      // Step 1 — atomic XP debit. Serialise par-row en PG : 2 debits concurrents
      // ne peuvent pas sur-depenser. Si la ligne players n'existe pas, on la
      // cree avec xp=0 d'abord (upsert), puis on retente — mais en pratique
      // un joueur sans ligne ne peut pas avoir d'XP a miser, donc on renvoie
      // directement insufficient_xp.
      const debit = await tx.execute<{ xp: number }>(
        sql`UPDATE players
            SET xp = xp - ${amount},
                last_seen = NOW()
            WHERE address = ${addr} AND xp >= ${amount}
            RETURNING xp`,
      );
      const debitRow = (debit as any).rows?.[0] ?? (debit as any)[0];
      if (!debitRow || typeof debitRow.xp !== "number") {
        return { ok: false, error: "insufficient_xp" };
      }
      const xpAfterDebit: number = debitRow.xp;

      // Step 2 — journal bet.
      const [betEvent] = await tx
        .insert(gameXpEvents)
        .values({
          gameKey: params.gameKey,
          gameSlug: params.slug,
          playerAddress: addr,
          playerToken: params.playerToken,
          eventType: "bet",
          amountXp: amount,
        })
        .returning({ id: gameXpEvents.id });

      const syntheticTxHash = `xp:${betEvent.id}`;

      // Step 3 — game-side dispatch (meme helpers que le flow balance CRC).
      if (isMulti) {
        const result = params.gameKey === "crc-races"
          ? await assignCrcRacesPlayer(tx, params.slug, addr, params.playerToken, amount, syntheticTxHash)
          : await assignMultiPlayer(tx, params.gameKey, params.slug, addr, params.playerToken, amount, syntheticTxHash);
        if ("error" in result) {
          // Rollback complet : debit XP + event 'bet' annules.
          throw new Error(`multi:${result.error}`);
        }
        return {
          ok: true as const,
          xpAfter: xpAfterDebit,
          family: "multi" as const,
          role: result.role,
          gameRow: result.gameRow,
        };
      }

      // Chance game.
      const result = await createChanceRound(
        tx,
        params.gameKey,
        params.slug,
        addr,
        params.playerToken,
        amount,
        syntheticTxHash,
        params.extras || {},
      );
      if ("error" in result) {
        throw new Error(`chance:${result.error}`);
      }

      let xpAfter = xpAfterDebit;
      let prizeXp: number | undefined;

      // Instant-resolve : coin_flip + lootbox resolvent au moment du bet.
      // Le dispatcher retourne `prizeCrc` — qui en F2P est interprete comme
      // un prize XP brut. On deduit la commission 5%, credite le joueur,
      // et alimente le pot DAO.
      if (INSTANT_RESOLVE_GAMES.has(params.gameKey)) {
        const grossPrize = typeof result.prizeCrc === "number" ? result.prizeCrc : 0;
        if (grossPrize > 0) {
          const commission = Math.floor((grossPrize * HOUSE_COMMISSION_PCT) / 100);
          const netPrize = grossPrize - commission;
          prizeXp = netPrize;

          const credit = await tx.execute<{ xp: number }>(
            sql`UPDATE players
                SET xp = xp + ${netPrize},
                    last_seen = NOW()
                WHERE address = ${addr}
                RETURNING xp`,
          );
          const creditRow = (credit as any).rows?.[0] ?? (credit as any)[0];
          if (creditRow && typeof creditRow.xp === "number") {
            xpAfter = creditRow.xp;
          }

          await tx.insert(gameXpEvents).values({
            gameKey: params.gameKey,
            gameSlug: params.slug,
            playerAddress: addr,
            playerToken: params.playerToken,
            eventType: "win",
            amountXp: netPrize,
          });

          if (commission > 0) {
            await tx.insert(daoXpPool).values({
              source: "house_edge_chance",
              gameKey: params.gameKey,
              amountXp: commission,
            });
          }
        } else {
          // Perte instantanee : tout le bet va au DAO.
          await tx.insert(gameXpEvents).values({
            gameKey: params.gameKey,
            gameSlug: params.slug,
            playerAddress: addr,
            playerToken: params.playerToken,
            eventType: "loss",
            amountXp: amount,
          });
          await tx.insert(daoXpPool).values({
            source: "house_edge_chance",
            gameKey: params.gameKey,
            amountXp: amount,
          });
        }
      }

      return {
        ok: true as const,
        xpAfter,
        family: "chance" as const,
        roundId: result.id,
        tableId: result.tableId,
        gameRow: result.gameRow,
        prizeXp,
      };
    });
  } catch (err: any) {
    const message = typeof err?.message === "string" ? err.message : "";
    const match = message.match(/^(multi|chance):(.+)$/);
    if (match) {
      const kind = match[2] as PayGameFromXpResult extends { ok: false; error: infer E } ? E : never;
      return { ok: false, error: kind as any };
    }
    console.error("[wallet-xp] payGameFromXp error:", err);
    return { ok: false, error: "internal_error" };
  }
}

/**
 * Credite les XP d'un gain multi a la fin de partie (pot * 0.95) + commission au DAO.
 * A appeler par les endpoints de fin de partie (resolve-winner) en mode F2P.
 * Idempotent via le log `game_xp_events` si la partie a deja ete payee.
 */
export async function creditMultiWinnerXp(params: {
  gameKey: string;
  slug: string;
  winnerAddress: string;
  pot: number;         // somme des mises (ex: 2 * betXp pour un 1v1)
  playerToken?: string | null;
}): Promise<{ ok: true; netXp: number; commissionXp: number } | { ok: false; error: string }> {
  const addr = params.winnerAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(addr)) return { ok: false, error: "invalid_address" };
  if (!params.pot || params.pot <= 0) return { ok: false, error: "invalid_amount" };

  const commission = Math.floor((params.pot * HOUSE_COMMISSION_PCT) / 100);
  const netXp = params.pot - commission;

  try {
    return await db.transaction(async (tx) => {
      // Idempotence : si un event 'win' existe deja pour cette (gameKey, gameSlug, winnerAddress),
      // on ne credite pas 2 fois.
      const existing = await tx
        .select({ id: gameXpEvents.id })
        .from(gameXpEvents)
        .where(sql`${gameXpEvents.gameKey} = ${params.gameKey}
                  AND ${gameXpEvents.gameSlug} = ${params.slug}
                  AND ${gameXpEvents.playerAddress} = ${addr}
                  AND ${gameXpEvents.eventType} = 'win'`)
        .limit(1);
      if (existing.length > 0) {
        return { ok: true as const, netXp, commissionXp: commission };
      }

      await tx.execute(
        sql`UPDATE players
            SET xp = xp + ${netXp}, last_seen = NOW()
            WHERE address = ${addr}`,
      );

      await tx.insert(gameXpEvents).values({
        gameKey: params.gameKey,
        gameSlug: params.slug,
        playerAddress: addr,
        playerToken: params.playerToken ?? null,
        eventType: "win",
        amountXp: netXp,
      });

      if (commission > 0) {
        await tx.insert(daoXpPool).values({
          source: "commission_multiplayer",
          gameKey: params.gameKey,
          amountXp: commission,
        });
      }

      return { ok: true as const, netXp, commissionXp: commission };
    });
  } catch (err) {
    console.error("[wallet-xp] creditMultiWinnerXp error:", err);
    return { ok: false, error: "internal_error" };
  }
}
