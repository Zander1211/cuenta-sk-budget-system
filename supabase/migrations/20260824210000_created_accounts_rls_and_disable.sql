-- ================================================================
-- Cuenta: RLS policies for created_accounts
--
-- The created_accounts table has RLS enabled but was missing an
-- UPDATE policy, which silently blocked the Disable / Enable
-- Account action from UserManagementPage.
--
-- This migration adds:
--   1. UPDATE policy — SK Chairman can update any account row
--      (needed for is_active, role, disabled_at, disabled_by)
--   2. SELECT policy — all authenticated users can read the
--      directory (needed to show the user list on every page)
--   3. disabled_at / disabled_by columns (idempotent ADD IF NOT EXISTS)
-- ================================================================

-- ── 1. UPDATE policy (SK Chairman only) ──────────────────────────
DROP POLICY IF EXISTS "SK Chairman can update created_accounts" ON public.created_accounts;
CREATE POLICY "SK Chairman can update created_accounts"
  ON public.created_accounts
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'SK Chairman'
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'SK Chairman'
  );

-- ── 2. SELECT policy (all authenticated users) ───────────────────
DROP POLICY IF EXISTS "Authenticated users can read created_accounts" ON public.created_accounts;
CREATE POLICY "Authenticated users can read created_accounts"
  ON public.created_accounts
  FOR SELECT
  TO authenticated
  USING (true);

-- ── 3. Disable metadata columns (idempotent) ─────────────────────
ALTER TABLE public.created_accounts
  ADD COLUMN IF NOT EXISTS disabled_at  TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS disabled_by  UUID        DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_created_accounts_is_active
  ON public.created_accounts (is_active);
