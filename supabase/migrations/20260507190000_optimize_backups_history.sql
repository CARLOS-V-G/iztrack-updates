DO $$
BEGIN
  IF to_regclass('public.backups') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_backups_user_id_created_at
      ON public.backups (user_id, created_at DESC);
  END IF;
END $$;
