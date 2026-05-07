import { pgTable, serial, text, timestamp, index, jsonb, integer } from "drizzle-orm/pg-core";

/**
 * Auth challenges — short-lived proofs of wallet ownership.
 *
 * Two flavors :
 *
 * - `miniapp_sign_message` : the front asks the host (Circles app) to sign
 *   a unique nonce via passkey. The server then verifies the signature
 *   against the wallet address (Safe via ERC-1271 or raw EOA).
 *
 * - `payment_1crc` : the user pays 1 CRC to the Safe with `data: nf_auth:<nonce>`.
 *   The server scans the chain, validates sender + amount + data, then refunds
 *   the 1 CRC.
 *
 * In both cases the result is the same : a session is created tied to the
 * verified address.
 *
 * Lifecycle :
 *   created → pending (challenge active, awaiting proof)
 *           → confirmed (proof validated, session created, used_at set)
 *           → expired (challenge aged out without proof)
 *           → refund_pending (payment_1crc only — refund tx broadcasting)
 *           → refunded (refund tx confirmed on-chain)
 *           → refund_failed (refund attempt failed, manual review needed)
 *           → rejected (signature/payment invalid, challenge dead)
 *
 * `used_at` is set atomically when a session is created, so a replay of the
 * same nonce/signature is impossible (UPDATE WHERE used_at IS NULL).
 */
export const authChallenges = pgTable(
  "auth_challenges",
  {
    id: serial("id").primaryKey(),
    /** Auth method used for this challenge. */
    method: text("method").notNull(), // "miniapp_sign_message" | "payment_1crc"
    /** Random unique nonce — embedded in the message/data the user proves. */
    nonce: text("nonce").notNull().unique(),
    /** Plain-text message that must be signed (sign_message) or the payment data (payment_1crc). */
    message: text("message").notNull(),
    /** Address expected to provide the proof — optional (Mini App may pre-fill it). */
    expectedAddress: text("expected_address"),
    /** On-chain tx hash (payment_1crc only) — the 1 CRC proof transaction. */
    txHash: text("tx_hash"),
    /** Hex signature returned by sign_success (miniapp_sign_message only). */
    signature: text("signature"),
    /** Refund tx hash (payment_1crc only) — Safe → user 1 CRC reimbursement. */
    refundTxHash: text("refund_tx_hash"),
    /**
     * Lifecycle marker. See module doc for state machine.
     * Values : pending | confirmed | expired | rejected | refund_pending
     *        | refunded | refund_failed
     */
    status: text("status").notNull().default("pending"),
    /** Free-text error if status terminated unsuccessfully. */
    errorMessage: text("error_message"),
    /** Origin context (UX hint, never used as auth proof). */
    origin: text("origin"), // "miniapp" | "standalone"
    /** Free-form metadata for future flow extensions. */
    metadata: jsonb("metadata"),
    /** Set atomically when a session is minted from this challenge — guards replay. */
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    /** Hard expiry — challenge is dead even if a proof arrives later. */
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => ({
    nonceIdx: index("auth_challenges_nonce_idx").on(table.nonce),
    statusIdx: index("auth_challenges_status_idx").on(table.status),
    expiresAtIdx: index("auth_challenges_expires_at_idx").on(table.expiresAt),
    txHashIdx: index("auth_challenges_tx_hash_idx").on(table.txHash),
  }),
);

export type AuthChallengeRow = typeof authChallenges.$inferSelect;
export type NewAuthChallenge = typeof authChallenges.$inferInsert;

/**
 * Auth sessions — long-lived proof-backed identity.
 *
 * A session is created after a successful challenge. The session token is
 * generated server-side (32 bytes from `crypto.randomBytes`) and split :
 *
 *   - secret token  → set in HttpOnly cookie on the user's browser
 *   - SHA-256 hash  → stored here in `tokenHash`
 *
 * On every authenticated request, the server reads the cookie, hashes it,
 * and looks up by `tokenHash`. If the row exists, is not revoked, and is
 * not expired, the session is valid and `address` is the trusted identity.
 *
 * Sliding window :
 *   - `expiresAt` slides forward to NOW() + 30 days on each refresh
 *   - `hardExpiresAt` is fixed at creation (NOW() + 90 days) — even active
 *     sessions force a re-auth past this point
 *   - Refresh DB write is throttled to max 1 per hour via `lastActiveAt` check
 *
 * Logout / revocation :
 *   - `revokedAt` is set when the user logs out, switches wallets, or admin
 *     revokes. A revoked session is immediately invalid.
 */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: serial("id").primaryKey(),
    /** SHA-256 hash of the secret token kept in the cookie. */
    tokenHash: text("token_hash").notNull().unique(),
    /** Authenticated wallet address (lowercased). */
    address: text("address").notNull(),
    /** Origin where the session was created. */
    origin: text("origin").notNull(), // "miniapp" | "standalone" | "unknown"
    /** Last challenge that authenticated this session — for audit trail. */
    lastAuthChallengeId: integer("last_auth_challenge_id"),
    /** Optional fingerprint of the user agent at creation — anonymized. */
    userAgentHash: text("user_agent_hash"),
    /**
     * Sliding expiration. Updated on activity (max once per hour).
     * Bound by `hardExpiresAt` which never moves.
     */
    expiresAt: timestamp("expires_at").notNull(),
    hardExpiresAt: timestamp("hard_expires_at").notNull(),
    /** Last time the session was used (refreshed lazily, see helper). */
    lastActiveAt: timestamp("last_active_at").defaultNow().notNull(),
    /** Last time the row was UPDATEd to slide expiresAt — for the 1h throttle. */
    lastRefreshedAt: timestamp("last_refreshed_at").defaultNow().notNull(),
    /** Set on logout / wallet switch / admin revoke. */
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    tokenHashIdx: index("auth_sessions_token_hash_idx").on(table.tokenHash),
    addressIdx: index("auth_sessions_address_idx").on(table.address),
    expiresAtIdx: index("auth_sessions_expires_at_idx").on(table.expiresAt),
  }),
);

export type AuthSessionRow = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
