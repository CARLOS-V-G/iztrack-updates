DO $$
BEGIN
  IF to_regclass('public.backups') IS NOT NULL THEN
    ALTER TABLE public.backups
      ADD COLUMN IF NOT EXISTS source text,
      ADD COLUMN IF NOT EXISTS sales_count integer,
      ADD COLUMN IF NOT EXISTS expenses_count integer,
      ADD COLUMN IF NOT EXISTS compressed_bytes integer,
      ADD COLUMN IF NOT EXISTS uncompressed_bytes integer;

    CREATE INDEX IF NOT EXISTS idx_backups_user_id_source_created_at
      ON public.backups (user_id, source, created_at DESC);
  END IF;
END $$;
