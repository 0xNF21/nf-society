-- Bureau des tickets perdus: auth token to recover playerToken via address proof
CREATE TABLE IF NOT EXISTS "nf_auth_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "token" text NOT NULL UNIQUE,
  "address" text,
  "tx_hash" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "nf_auth_tokens_token_idx" ON "nf_auth_tokens" ("token");
CREATE INDEX IF NOT EXISTS "nf_auth_tokens_address_idx" ON "nf_auth_tokens" ("address");
