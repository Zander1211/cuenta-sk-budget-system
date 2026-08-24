-- ================================================================
-- Cuenta: Force View-Only Access for SK Kagawad
-- Dynamically drops all existing SELECT policies and creates a single permissive one.
-- ================================================================

DO $$
DECLARE
    pol RECORD;
BEGIN
    -- 1. Drop all SELECT policies on public.expenses
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'expenses' AND cmd = 'SELECT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.expenses', pol.policyname);
    END LOOP;

    -- 2. Drop all SELECT policies on public.budget_requests
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'budget_requests' AND cmd = 'SELECT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.budget_requests', pol.policyname);
    END LOOP;

    -- 3. Drop all SELECT policies on public.budgets
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'budgets' AND cmd = 'SELECT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.budgets', pol.policyname);
    END LOOP;

    -- 4. Drop all SELECT policies on public.receipt_records
    FOR pol IN
        SELECT policyname
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'receipt_records' AND cmd = 'SELECT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.receipt_records', pol.policyname);
    END LOOP;
END $$;

-- Now, recreate a single permissive SELECT policy for each table
CREATE POLICY "Allow all authenticated users to read expenses"
  ON public.expenses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to read budget_requests"
  ON public.budget_requests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to read budgets"
  ON public.budgets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all authenticated users to read receipt_records"
  ON public.receipt_records FOR SELECT TO authenticated USING (true);
