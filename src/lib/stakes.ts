/**
 * Kill switch central du pivot Free-to-Play — partie serveur.
 *
 * Lit deux flags dans `feature_flags` :
 *
 *   real_stakes              (kill switch global)
 *     - 'enabled' → mode CRC reel possible (sauf override par chance_games_xp_only)
 *     - 'hidden'  → tout en F2P XP, sans exception (cashout reste ouvert)
 *
 *   chance_games_xp_only     (override par categorie)
 *     - 'enabled' → comportement nominal, on respecte real_stakes pour tous
 *     - 'hidden'  → les chance games (blackjack, roulette, dice, plinko, mines,
 *                   hilo, keno, crash-dash, coin-flip, lootbox, lottery)
 *                   sont forces en XP meme si real_stakes=enabled. Skill multi
 *                   (morpion, dames, memory, pfc, relics, crc-races) reste CRC.
 *
 * Truth table :
 *   real=enabled  + chance_xp_only=enabled  → all CRC
 *   real=enabled  + chance_xp_only=hidden   → skill CRC, chance XP
 *   real=hidden   + (anything)              → all XP
 *
 * Exception : le cashout (gameType="cashout") ne passe PAS par ces helpers
 * — les retraits CRC restent toujours possibles, meme en F2P total.
 *
 * Les helpers purs (formatStake, crcToXp, isChanceGameKey, etc.) sont dans
 * `src/lib/stakes-utils.ts` pour pouvoir etre importes par les composants
 * client sans tirer `pg`/DB.
 */

import { db } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  REAL_STAKES_FLAG_KEY,
  CHANCE_XP_ONLY_FLAG_KEY,
  isChanceGameKey,
} from "./stakes-utils";

export {
  REAL_STAKES_FLAG_KEY,
  CHANCE_XP_ONLY_FLAG_KEY,
  CRC_TO_XP_RATIO,
  CHANCE_GAME_KEYS,
  isChanceGameKey,
  crcToXp,
  xpToCrc,
  formatStake,
  stakeUnit,
} from "./stakes-utils";

export class StakesDisabledError extends Error {
  constructor(message = "Real CRC stakes are disabled — the platform is in Free-to-Play mode") {
    super(message);
    this.name = "StakesDisabledError";
  }
}

/**
 * Cache court pour eviter une requete DB a chaque appel.
 * Lit les deux flags en une seule query. TTL 10s — un toggle admin se
 * propage en quelques secondes maximum.
 */
const CACHE_TTL_MS = 10_000;
type FlagsSnapshot = { realStakes: boolean; chanceXpOnly: boolean };
let cached: { value: FlagsSnapshot; expiresAt: number } | null = null;

async function readFlags(): Promise<FlagsSnapshot> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const rows = await db
      .select({ key: featureFlags.key, status: featureFlags.status })
      .from(featureFlags)
      .where(inArray(featureFlags.key, [REAL_STAKES_FLAG_KEY, CHANCE_XP_ONLY_FLAG_KEY]));

    const map = new Map(rows.map((r) => [r.key, r.status] as const));
    // Both flags default to 'enabled' on missing rows (fail-open / status-quo).
    const realStatus = map.get(REAL_STAKES_FLAG_KEY) ?? "enabled";
    const chanceStatus = map.get(CHANCE_XP_ONLY_FLAG_KEY) ?? "enabled";

    const value: FlagsSnapshot = {
      realStakes: realStatus === "enabled",
      chanceXpOnly: chanceStatus === "enabled",
    };
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    // Fail-open : DB inaccessible → preserve le comportement CRC actuel.
    return { realStakes: true, chanceXpOnly: true };
  }
}

/**
 * Retourne `true` si les mises/gains reels en CRC sont actifs pour ce jeu.
 *
 * @param gameKey — Si fourni et qu'il s'agit d'un chance game, le flag
 * `chance_games_xp_only` peut forcer XP. Si omis, on ne lit que le flag
 * global `real_stakes` (utile pour les routes qui ne sont pas liees a un jeu
 * specifique, ex: topup-scan).
 */
export async function isRealStakesEnabled(gameKey?: string | null): Promise<boolean> {
  const flags = await readFlags();
  if (!flags.realStakes) return false; // global kill switch
  if (gameKey && isChanceGameKey(gameKey) && !flags.chanceXpOnly) return false;
  return true;
}

/** Force une relecture immediate des flags (a utiliser apres un toggle admin). */
export function invalidateStakesCache(): void {
  cached = null;
}

/**
 * Throw `StakesDisabledError` si le mode CRC reel est desactive pour ce jeu.
 * A utiliser en entree des routes API qui manipulent du CRC
 * (pay-game, topup-scan, *-scan, etc.) — SAUF cashout-init qui reste toujours ouvert.
 */
export async function assertRealStakesEnabled(gameKey?: string | null): Promise<void> {
  if (!(await isRealStakesEnabled(gameKey))) {
    throw new StakesDisabledError();
  }
}

/**
 * Retourne une `NextResponse` 403 si le mode CRC reel est desactive, sinon `null`.
 * A appeler en tete des routes API gating :
 *
 *   const disabled = await respondIfStakesDisabled("blackjack");
 *   if (disabled) return disabled;
 *
 * Le cashout reste toujours ouvert — ne PAS utiliser ce helper dans
 * `src/app/api/wallet/cashout-init/route.ts`.
 */
export async function respondIfStakesDisabled(
  gameKey?: string | null,
): Promise<NextResponse | null> {
  if (await isRealStakesEnabled(gameKey)) return null;
  return NextResponse.json(
    {
      error: "stakes_disabled",
      message: "Real CRC stakes are disabled. The platform is in Free-to-Play (XP) mode.",
    },
    { status: 403 },
  );
}
