-- Phase 3a — Wallet foundations
-- Adds balance_crc to players and creates the wallet_ledger append-only log.

ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "balance_crc" real NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "wallet_ledger" (
  "id"             serial PRIMARY KEY NOT NULL,
  "address"        text NOT NULL,
  "kind"           text NOT NULL,
  "amount_crc"     real NOT NULL,
  "balance_after"  real NOT NULL,
  "reason"         text,
  "tx_hash"        text UNIQUE,
  "game_type"      text,
  "game_slug"      text,
  "created_at"     timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "wallet_ledger_address_idx" ON "wallet_ledger" ("address");
CREATE INDEX IF NOT EXISTS "wallet_ledger_created_idx" ON "wallet_ledger" ("created_at" DESC);
