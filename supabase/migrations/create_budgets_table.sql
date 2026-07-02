-- ================================================================
-- Cuenta: Create/Update Budgets Table
-- ================================================================

CREATE TABLE IF NOT EXISTS budgets (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  month        INTEGER NOT NULL,
  quarter      INTEGER NOT NULL,
  year         INTEGER NOT NULL,
  amount       NUMERIC NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- If the table exists but is missing columns, add them (safe to run)
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS month INTEGER;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS quarter INTEGER;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS amount NUMERIC;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now() NOT NULL;

-- Index for filtering by year/month
CREATE INDEX IF NOT EXISTS idx_budgets_year_month ON budgets(year, month);
CREATE INDEX IF NOT EXISTS idx_budgets_created_at ON budgets(created_at DESC);

-- Enable RLS
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can insert budgets
CREATE POLICY "Authenticated users can insert budgets"
  ON budgets FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Any authenticated user can read budgets
CREATE POLICY "Authenticated users can read budgets"
  ON budgets FOR SELECT
  TO authenticated
  USING (true);

-- Only SK Treasurer can update/delete (Optional, but safe default)
CREATE POLICY "Authenticated users can update budgets"
  ON budgets FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete budgets"
  ON budgets FOR DELETE
  TO authenticated
  USING (true);
