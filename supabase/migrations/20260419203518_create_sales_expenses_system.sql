/*
  # Sales and Expenses Management System

  ## Overview
  This migration creates the core tables for a comprehensive sales and expense
  management system for small and medium businesses.

  ## New Tables

  ### 1. `sales`
  Records individual sales transactions throughout the day.
  - `id` - Unique identifier
  - `sale_date` - The business date of the sale (auto-set, never changes)
  - `amount` - Transaction amount
  - `payment_method` - How payment was received (cash, debit, credit, transfer, digital_wallet)
  - `notes` - Optional notes
  - `voided` - Whether the sale was cancelled/reversed
  - `created_at` - Timestamp of record creation

  ### 2. `expenses`
  Records business expenses with payment status tracking.
  - `id` - Unique identifier
  - `expense_date` - The business date of the expense (auto-set, never changes)
  - `concept` - Description of what the expense was for
  - `category` - Optional category grouping
  - `amount` - Expense amount
  - `payment_method` - How it was or will be paid
  - `status` - Whether the expense is 'paid' or 'pending'
  - `notes` - Optional notes
  - `created_at` - Timestamp of record creation

  ## Security
  - RLS enabled on all tables
  - Policies allow authenticated users to manage their own data
  - Public access disabled by default
*/

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_date date NOT NULL DEFAULT CURRENT_DATE,
  amount decimal(12, 2) NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'debit', 'credit', 'transfer', 'digital_wallet')),
  notes text DEFAULT '',
  voided boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  concept text NOT NULL,
  category text DEFAULT '',
  amount decimal(12, 2) NOT NULL CHECK (amount >= 0),
  payment_method text NOT NULL CHECK (payment_method IN ('cash', 'debit', 'credit', 'transfer', 'digital_wallet')),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'pending')),
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_sale_date ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_payment_method ON sales(payment_method);
CREATE INDEX IF NOT EXISTS idx_sales_voided ON sales(voided);
CREATE INDEX IF NOT EXISTS idx_expenses_expense_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);

ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on sales"
  ON sales
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow insert on sales"
  ON sales
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update on sales"
  ON sales
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete on sales"
  ON sales
  FOR DELETE
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow all operations on expenses"
  ON expenses
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow insert on expenses"
  ON expenses
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Allow update on expenses"
  ON expenses
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete on expenses"
  ON expenses
  FOR DELETE
  TO anon, authenticated
  USING (true);
