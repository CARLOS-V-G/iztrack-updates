DO $$
BEGIN
  IF to_regclass('public.licenses') IS NOT NULL THEN
    ALTER TABLE public.licenses
      ADD COLUMN IF NOT EXISTS data_wipe_requested_at timestamptz,
      ADD COLUMN IF NOT EXISTS data_wipe_completed_at timestamptz,
      ADD COLUMN IF NOT EXISTS data_wipe_reason text;

    CREATE INDEX IF NOT EXISTS idx_licenses_data_wipe_requested
      ON public.licenses (data_wipe_requested_at)
      WHERE data_wipe_requested_at IS NOT NULL;
  END IF;
END $$;
