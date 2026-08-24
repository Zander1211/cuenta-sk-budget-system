-- ================================================================
-- Cuenta: Grant View-Only Access to SK Kagawad
-- Ensures that SK Kagawad can view all financial records.
-- ================================================================

-- 1. Ensure expenses are viewable by all authenticated users (including SK Kagawad)
DROP POLICY IF EXISTS "Authenticated users can read expenses" ON public.expenses;
CREATE POLICY "Authenticated users can read expenses"
  ON public.expenses FOR SELECT TO authenticated USING (true);

-- 2. Ensure budget_requests are viewable by all authenticated users
DROP POLICY IF EXISTS "Authenticated users can read requests" ON public.budget_requests;
DROP POLICY IF EXISTS "Authenticated users can read budget_requests" ON public.budget_requests;
CREATE POLICY "Authenticated users can read budget_requests"
  ON public.budget_requests FOR SELECT TO authenticated USING (true);

-- 3. Ensure budgets are viewable by all authenticated users
DROP POLICY IF EXISTS "Authenticated users can read budgets" ON public.budgets;
CREATE POLICY "Authenticated users can read budgets"
  ON public.budgets FOR SELECT TO authenticated USING (true);

-- 4. Ensure receipt_records are viewable by all authenticated users
DROP POLICY IF EXISTS "Users can view all receipt records" ON public.receipt_records;
CREATE POLICY "Users can view all receipt records"
  ON public.receipt_records FOR SELECT TO authenticated USING (true);

-- 5. Ensure member_biodata is viewable by all authenticated users (if needed for profile images etc)
-- Leaving this as is since biodata might be sensitive, but basic data should be visible if needed.
