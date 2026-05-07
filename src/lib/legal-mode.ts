/**
 * Filet legal au niveau env, prioritaire sur tous les flags DB.
 *
 * Le pivot Free-to-Play retire les mises et gains CRC reels de la plateforme.
 * Pour eviter qu'une panne DB ou un mauvais toggle admin ne reactive
 * accidentellement le mode CRC, ce module lit `LEGAL_MODE` directement depuis
 * l'environnement et court-circuite la verification DB quand la valeur n'est
 * pas explicitement `REAL_STAKES_ALLOWED`.
 *
 * Defaut : `F2P_ONLY`. Une env var manquante, mal orthographiee, ou en blanc
 * retombe automatiquement sur F2P. Pour reactiver le mode CRC il faut
 * volontairement poser `LEGAL_MODE=REAL_STAKES_ALLOWED` en prod.
 */

export type LegalMode = "F2P_ONLY" | "REAL_STAKES_ALLOWED";

export function getLegalMode(): LegalMode {
  return process.env.LEGAL_MODE === "REAL_STAKES_ALLOWED"
    ? "REAL_STAKES_ALLOWED"
    : "F2P_ONLY";
}

/** True quand l'env force le mode F2P, peu importe les flags DB. */
export function isF2POnlyMode(): boolean {
  return getLegalMode() !== "REAL_STAKES_ALLOWED";
}

/**
 * True uniquement quand le mode CRC reel est explicitement autorise. Utilise
 * pour gater les routes top-up : en F2P, pas de top-up, pas de credit
 * `players.balance_crc` depuis un paiement on-chain.
 */
export function areTopupsEnabled(): boolean {
  return getLegalMode() === "REAL_STAKES_ALLOWED";
}
