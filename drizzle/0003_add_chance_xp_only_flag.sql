-- 0003_add_chance_xp_only_flag.sql
--
-- Adds a SECOND kill-switch knob on top of `real_stakes`, so the admin can
-- force just the chance games into XP while keeping skill multi (morpion,
-- dames, memory, pfc, relics, crc-races) on real CRC. Useful for pivoting
-- away from the riskiest gambling-shaped games (blackjack, roulette, dice,
-- plinko, mines, hilo, keno, crash-dash, coin-flip, lootbox, lottery)
-- without touching the multiplayer skill economy.
--
-- Truth table (after this migration):
--   real_stakes=enabled  + chance_games_xp_only=enabled  → all CRC (status quo)
--   real_stakes=enabled  + chance_games_xp_only=hidden   → skill CRC, chance XP
--   real_stakes=hidden   + (anything)                    → all XP (global F2P)
--
-- Default seed = 'enabled' to preserve current behavior. Idempotent.

INSERT INTO "feature_flags" ("key", "status", "label", "category", "updated_at")
VALUES (
  'chance_games_xp_only',
  'enabled',
  'Chance games en XP uniquement (skill multi reste en CRC)',
  'governance',
  now()
)
ON CONFLICT ("key") DO NOTHING;
