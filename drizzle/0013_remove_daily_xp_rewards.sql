-- Daily rewards are Fragments-only. Remove only legacy Daily XP reward config.
DO $$
BEGIN
  IF to_regclass('public.xp_config') IS NOT NULL THEN
    DELETE FROM "xp_config"
    WHERE "key" IN ('daily_checkin', 'daily_spin', 'daily_wheel', 'streak_7days');
  END IF;
END $$;
