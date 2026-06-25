CREATE TABLE IF NOT EXISTS mp_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id text UNIQUE NOT NULL,
  amount numeric(12, 2) NOT NULL CHECK (amount >= 0),
  status text NOT NULL DEFAULT 'pending',
  payer_email text DEFAULT '',
  payment_method text DEFAULT '',
  raw_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mp_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role can insert mp_payments"
  ON mp_payments FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "authenticated users can read mp_payments"
  ON mp_payments FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_mp_payments_payment_id ON mp_payments(payment_id);
CREATE INDEX IF NOT EXISTS idx_mp_payments_created_at ON mp_payments(created_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE mp_payments;
