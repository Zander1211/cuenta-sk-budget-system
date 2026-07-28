-- ================================================================
-- Cuenta: Fix schema drift on budgets/expenses
--
-- The live tables were created with an older/different column layout
-- than what the app code and other migrations expect. Both tables are
-- currently empty, so this is purely additive: it adds the missing
-- columns the app needs without touching or removing anything that
-- already exists (project_title, allocated_budget, etc. are left in
-- place, just unused by the current code).
-- ================================================================

-- ---------- budgets ----------
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS month INTEGER;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS quarter INTEGER;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS year INTEGER;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS amount NUMERIC;
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS idx_budgets_year_month ON budgets(year, month);

ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert budgets" ON budgets;
CREATE POLICY "Authenticated users can insert budgets"
  ON budgets FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read budgets" ON budgets;
CREATE POLICY "Authenticated users can read budgets"
  ON budgets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can update budgets" ON budgets;
CREATE POLICY "Authenticated users can update budgets"
  ON budgets FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete budgets" ON budgets;
CREATE POLICY "Authenticated users can delete budgets"
  ON budgets FOR DELETE TO authenticated USING (true);

-- ---------- expenses ----------
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS event TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS project TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS type TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Approved';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS date DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS event_date DATE;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS venue TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS breakdown JSONB;
-- receipt_url / receipt_name already exist (added by add_receipt_columns_to_expenses.sql)

CREATE INDEX IF NOT EXISTS idx_expenses_approved_at ON expenses(approved_at);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can insert expenses" ON expenses;
CREATE POLICY "Authenticated users can insert expenses"
  ON expenses FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can read expenses" ON expenses;
CREATE POLICY "Authenticated users can read expenses"
  ON expenses FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can update expenses" ON expenses;
CREATE POLICY "Authenticated users can update expenses"
  ON expenses FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete expenses" ON expenses;
CREATE POLICY "Authenticated users can delete expenses"
  ON expenses FOR DELETE TO authenticated USING (true);
