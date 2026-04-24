/**
 * Kill switch central du pivot Free-to-Play — partie serveur.
 *
 * Lit le flag `real_stakes` de la table `feature_flags` :
 *   - status='enabled' → mode CRC classique (mise/gain/payout on-chain)
 *   - status='hidden'  → mode Free-to-Play XP (toutes les routes CRC sont bloquees,
 *                        les jeux tournent en XP virtuels)
 *
 * Exception importante : le cashout (retrait CRC depuis la Safe) reste
 * toujours ouvert meme en mode F2P — il ne passe PAS par `assertRealStakesEnabled`.
 * Les anciens joueurs peuvent vider leur balance existante indefiniment.
 *
 * Les helpers purs (formatStake, crcToXp, etc.) sont dans `src/lib/stakes-utils.ts`
 * pour pouvoir etre importes par les composants client sans tirer `pg`/DB.
 */

import { db } from "@/lib/db";
import { featureFlags } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export {
  REAL_STAKES_FLAG_KEY,
  CRC_TO_XP_RATIO,
  crcToXp,
  xpToCrc,
  formatStake,
  stakeUnit,
} from "./stakes-utils";

import { REAL_STAKES_FLAG_KEY } from "./stakes-utils";

export class StakesDisabledError extends Error {
  constructor(message = "Real CRC stakes are disabled — the platform is in Free-to-Play mode") {
    super(message);
    this.name = "StakesDisabledError";
  }
}

/**
 * Cache court pour eviter une requete DB a chaque appel de route API.
 * Duree : 10s. Le toggle admin se propage en quelques secondes maximum.
 */
const CACHE_TTL_MS = 10_000;
let cached: { value: boolean; expiresAt: number } | null = null;

/**
 * Retourne `true` si les mises/gains reels en CRC sont actifs.
 * Defaut `true` si le flag n'existe pas ou si la DB est inaccessible
 * (fail-open pour ne pas casser le site en cas de probleme de lecture).
 */
export async function isRealStakesEnabled(): Promise<boolean> {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const row = await db
      .select({ status: featureFlags.status })
      .from(featureFlags)
      .where(eq(featureFlags.key, REAL_STAKES_FLAG_KEY))
      .limit(1);
    const value = row.length === 0 ? true : row[0].status === "enabled";
    cached = { value, expiresAt: now + CACHE_TTL_MS };
    return value;
  } catch {
    // Fail-open : en cas d'erreur DB, on preserve le comportement actuel.
    return true;
  }
}

/** Force une relecture immediate du flag (a utiliser apres un toggle admin). */
export function invalidateStakesCache(): void {
  cached = null;
}

/**
 * Throw `StakesDisabledError` si le mode CRC reel est desactive.
 * A utiliser en entree des routes API qui manipulent du CRC
 * (pay-game, topup-scan, *-scan, etc.) — SAUF cashout-init qui reste toujours ouvert.
 */
export async function assertRealStakesEnabled(): Promise<void> {
  if (!(await isRealStakesEnabled())) {
    throw new StakesDisabledError();
  }
}

/**
 * Retourne une `NextResponse` 403 si le mode CRC reel est desactive, sinon `null`.
 * A appeler en tete des routes API gating :
 *
 *   const disabled = await respondIfStakesDisabled();
 *   if (disabled) return disabled;
 *
 * Le cashout reste toujours ouvert — ne PAS utiliser ce helper dans
 * `src/app/api/wallet/cashout-init/route.ts`.
 */
import { NextResponse } from "next/server";
export async function respondIfStakesDisabled(): Promise<NextResponse | null> {
  if (await isRealStakesEnabled()) return null;
  return NextResponse.json(
    {
      error: "stakes_disabled",
      message: "Real CRC stakes are disabled. The platform is in Free-to-Play (XP) mode.",
    },
    { status: 403 }
  );
}
