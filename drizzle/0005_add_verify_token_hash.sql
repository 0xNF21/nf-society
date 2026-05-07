-- Add verify_token_hash to auth_challenges for replay protection on payment_1crc.
--
-- Without this, an attacker who watches the chain for nf_auth_v2 payments
-- can guess sequential challenge IDs and claim sessions for legitimate
-- users (the on-chain proof becomes public).
--
-- Verify flow now requires { challengeId, verifyToken } where the token
-- is generated server-side at challenge creation and only returned to the
-- originating browser (never broadcast on-chain).

ALTER TABLE "auth_challenges" ADD COLUMN IF NOT EXISTS "verify_token_hash" text;
